# API Contract — Apps Script Operations (de-facto)

The legacy backend is a single Google Apps Script endpoint. The client multiplexes ~90
operations by POSTing `{ event: "<name>", ...payload }` — that's **74 distinct `event:` strings
plus the sub-actions multiplexed through `ats_log`** (`daily_log`, `journal_entry`,
`assign_role`, `crm_*`, etc.). This is the **de-facto API contract** and the checklist of
behavior the new typed API must replace.

> ⚠️ The Apps Script source is **not in this repo**. Request/response shapes below are
> inferred from client call sites in `index.html`. Confirm each against `Code.gs` before
> relying on it. Writes using `mode:"no-cors"` are fire-and-forget (client cannot read the
> response); reads use `text/plain` POST and parse JSON.

## Transport notes
- Base URL: a hardcoded `script.google.com/macros/s/.../exec` (see `index.html`, var `U`).
- `post(d)` → `mode:"no-cors"` write (no readable response).
- `postJSON(d)` → `text/plain` POST, returns parsed JSON (`{status:"ok"|"error", ...}`).
- A plain `GET` to the base URL returns the full dataset (`{candidates, notes, activity,
  profiles, accessRequests, ...}`) — used by `load()`.

## Operations by domain

### Candidates / pipeline
| event | Purpose |
|-------|---------|
| `ats_add_candidate` | Create candidate |
| `ats_update_candidate` | Edit candidate fields |
| `ats_move_candidate` | Change pipeline stage |
| `ats_delete_candidate` | Soft-delete |
| `ats_restore_candidate` | Restore soft-deleted |
| `ats_purge_candidate` | Hard delete |
| `ats_park_action` | Park / unpark candidate _(confirm semantics)_ |
| `ats_verify_license` | Mark/verify license status |
| `ats_log` | Append activity/audit entry (most-used event) |
| `candidate_log_outreach` | Log outreach on a candidate |

### Notes & mentions
| event | Purpose |
|-------|---------|
| `ats_add_note` | Add note (internal/external) to candidate |
| `ats_notify_mention` | Create @mention notification |
| `ats_get_mentions` | Fetch mentions for a recipient |
| `ats_mark_mention_read` | Mark one/all mentions read |

### Source leads (sourcing)
| event | Purpose |
|-------|---------|
| `source_lead_add` | Add a lead |
| `source_lead_bulk_import` | Bulk import (chunked, CSV/XLSX) |
| `source_lead_log_outreach` | Log an outreach attempt |
| `source_lead_edit_outreach` | Edit an attempt |
| `source_lead_delete_outreach` | Delete an attempt |
| `source_lead_bulk_log_outreach` | Bulk log outreach |
| `source_lead_bulk_action` | Bulk status change / delete |
| `source_lead_snooze` | Snooze a lead |
| `source_lead_undelete` | Undo soft-delete (30s window) |
| `source_lead_promote` | Promote lead → pipeline candidate |

### Open roles
| event | Purpose |
|-------|---------|
| `open_role_add` / `open_role_update` / `open_role_delete` | Manage requisitions |

### Clients & CRM
| event | Purpose |
|-------|---------|
| `client_profile_save` / `client_profile_delete` | Client profile |
| `client_contact_delete` | Remove client contact |
| `deal_update` / `deal_close` / `deal_delete` | CRM deals |
| `crm_email_pull` | Pull emails into CRM |
| `crm_ai_workspace` | AI CRM assistant |

### AI / briefs / parsing
| event | Purpose |
|-------|---------|
| `extract_resume` | AI resume → structured candidate |
| `ats_parse_jd` | AI parse job description |
| `daily_brief_generate` / `daily_brief_save` | Daily brief |
| `weekly_brief_generate` / `weekly_brief_save` / `weekly_brief_patterns` | Weekly brief + patterns |
| `ats_overview_brief_get_or_generate` | Overview masthead brief |
| `inbound_triage` | AI triage of inbound message |

### Verification / providers
| event | Purpose |
|-------|---------|
| `verification_preset_save` / `verification_preset_delete` | Saved verification presets |
| `op_add_provider` | Add provider (operations) |
| `enrich_provider_contact` | Enrich provider contact info |

### Targets / KPIs
| event | Purpose |
|-------|---------|
| `ats_targets_get` / `ats_targets_set` / `ats_targets_suggest` | Per-associate targets |
| `ats_actuals_get` / `ats_actuals_save` | Actuals |
| `ats_pipeline_health` | Pipeline health metrics |

### Users / auth / admin
| event | Purpose |
|-------|---------|
| `add_invite` / `update_invite` / `remove_invite` | User invites |
| `resend_welcome` | Resend welcome email |
| `block_user` / `unblock_user` | Block management |
| `change_password` / `reset_password` | Password ops |
| `ats_update_profile` | Update profile/avatar/signature |
| `access_request` / `approve_request` / `decline_request` | Access requests |
| `role_note_add` / `role_note_delete` | Role notes |

### Client portal (`?portal=true`)
| event | Purpose |
|-------|---------|
| `portal_data` | Fetch portal dataset (read-only) |
| `portal_request_access` | Client requests access |
| `portal_post_role` | Client posts an open role |
| `portal_log_view` | Log a portal view |

### Migration / bulk import
| event | Purpose |
|-------|---------|
| `migration_prepare` | Preview/dedupe legacy rows |
| `migration_commit` | Commit import |

---

## Target API design notes
- Replace the single multiplexed endpoint with **resource-oriented routes** (e.g.
  `POST /candidates`, `PATCH /candidates/:id`, `POST /candidates/:id/move`,
  `POST /leads/:id/promote`).
- **Validate every payload** (zod) and **authorize every call** server-side by role.
- Make writes **return their result** (no more fire-and-forget `no-cors`).
- AI operations (`extract_resume`, `*_brief_generate`, `crm_ai_workspace`, `inbound_triage`,
  `ats_parse_jd`) call the LLM **server-side with a server-held key**.
- Keep an **audit entry** for every state-changing operation (generalize `ats_log`).
