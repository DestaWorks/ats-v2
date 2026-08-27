/**
 * Learn tutorial contract (Wave 5.4, legacy `index.html:5201-5275`) — isomorphic types + zod
 * shared by the `/learn` page and the `/api/me/learn-progress` route. Pure (NO server imports).
 *
 * Progress is server-backed here (`User.learnProgress`), not legacy's unscoped `localStorage`
 * (`desta_learn_progress` — per-device, never synced, the same class of bug Wave 4.1 already
 * fixed once for signature/sticky-note).
 */
import { z } from "zod";

export interface LearnChapter {
  id: string;
  num: number;
  title: string;
  blurb: string;
  mins: number;
  /** GIF filename legacy expected under `/tutorial/` — never actually produced; the UI shows a
   *  "record a Loom and drop it here" placeholder when it 404s, same as legacy did. */
  media: string;
  /** Which real app route "Try it" deep-links to. */
  tryHref: string;
  tryLabel: string;
  steps: string[];
}

/** The 8 chapters, ported verbatim (title/blurb/mins/steps/labels) from legacy. `tryHref` maps
 *  legacy's internal `vw` view keys onto this app's real routes. */
export const LEARN_CHAPTERS: LearnChapter[] = [
  {
    id: "overview",
    num: 1,
    title: "Your First 60 Seconds",
    blurb: "What you see when you sign in. Where everything is. How to find anything fast.",
    mins: 3,
    media: "learn-01-overview.gif",
    tryHref: "/dashboard",
    tryLabel: "Open Overview",
    steps: [
      "Sign in. You land on the Overview tab.",
      "The masthead shows your morning brief — read it first.",
      "Sidebar on the left: every tab you have access to. Pipeline is where active candidates live.",
      "Top right: alerts inbox. It will fill up as you work.",
    ],
  },
  {
    id: "daily-brief",
    num: 2,
    title: "Daily Brief — Your Morning Standup",
    blurb: "Read yesterday's results. Set today's targets. Spot what's stuck.",
    mins: 4,
    media: "learn-02-daily-brief.gif",
    tryHref: "/daily-log",
    tryLabel: "Open Daily Brief",
    steps: [
      "Open the Daily Brief tab on the left.",
      "Top section: yesterday's actuals vs targets. Green = hit, red/orange = miss.",
      "Middle: today's targets. Managers can click 'AI Suggest' to propose them from tenure + recent history.",
      "Bottom: per-associate rollup — see what everyone is working on right now.",
    ],
  },
  {
    id: "sourcing",
    num: 3,
    title: "Sourcing — Find and Track Leads",
    blurb: "Add new leads, bulk import from CSV, log outreach attempts, and track who's responded.",
    mins: 5,
    media: "learn-03-sourcing.gif",
    tryHref: "/sourcing",
    tryLabel: "Open Sourcing",
    steps: [
      "Open Sourcing. Inventory view shows every lead you have sourced.",
      "Add a single lead with + Add Lead, or use Bulk Import for a CSV.",
      "Click any lead to log outreach — channel, template, response.",
      "Use the filter chips to find leads by status (Sourced, Outreach 1-3, Responded Hot, etc.).",
      "When a lead is ready to enter pipeline, click Promote.",
    ],
  },
  {
    id: "open-roles",
    num: 4,
    title: "Open Roles — Match Leads to Client Needs",
    blurb: "Post a client need, get AI matches from your sourced pool, promote with one click.",
    mins: 5,
    media: "learn-04-open-roles.gif",
    tryHref: "/roles",
    tryLabel: "Open Roles",
    steps: [
      "Open the Open Roles tab. Top roles to work right now are called out, color-coded by priority.",
      "Click + Add Role. Paste or drop a JD into the panel, then Parse with AI — fields auto-fill.",
      "Each role card shows top matches inline. Promote a lead into pipeline in one click.",
      "Add notes at the bottom of each role card to track intake, client feedback, and decisions.",
    ],
  },
  {
    id: "pipeline",
    num: 5,
    title: "Pipeline — Move Candidates from New to Placed",
    blurb: "Board view of every active candidate. Drag to move stages. Track aging.",
    mins: 4,
    media: "learn-05-pipeline.gif",
    tryHref: "/pipeline",
    tryLabel: "Open Pipeline",
    steps: [
      "Open Pipeline. Columns left to right track the real pipeline stages.",
      "Drag a card to a new column to advance it. Stuck/overdue cards get a chip.",
      "Click a card to open the detail view — notes, license, journey timeline, quick actions.",
      "Deleting moves a candidate to Trash — restore it from there if you change your mind.",
    ],
  },
  {
    id: "templates",
    num: 6,
    title: "Templates — Submit Candidates to Clients",
    blurb: "Send polished candidate packages with one click. Per-client verification presets.",
    mins: 4,
    media: "learn-06-templates.gif",
    tryHref: "/templates",
    tryLabel: "Open Templates",
    steps: [
      "Open Templates. Pick a client and a candidate.",
      "Templates fill the email body automatically. Edit as needed.",
      "Copy the formatted package and paste it into your email client of choice.",
    ],
  },
  {
    id: "notes-mentions",
    num: 7,
    title: "Notes + Mentions — Working with the Team",
    blurb: "Log call notes, tag teammates with @, get notified when someone tags you.",
    mins: 3,
    media: "learn-07-notes-mentions.gif",
    tryHref: "/pipeline",
    tryLabel: "Open Pipeline",
    steps: [
      "Inside any candidate detail page, open the Notes tab.",
      "Type a note. Use @firstname to tag a teammate.",
      "Notes are timestamped and attributed.",
      "Your alerts inbox shows every mention waiting on you.",
    ],
  },
  {
    id: "weekly-brief",
    num: 8,
    title: "Weekly Brief — Step Back and See the Whole Week",
    blurb: "End-of-week recap. Wins, blockers, decisions, per-associate summary.",
    mins: 3,
    media: "learn-08-weekly-brief.gif",
    tryHref: "/weekly-brief",
    tryLabel: "Open Weekly Brief",
    steps: [
      "Open the Weekly Brief tab. A Friday-afternoon habit — read it before logging off.",
      "The headline + KPI narrative summarize the week.",
      "Per-client and per-associate rollups show wins, blockers, and next-week focus.",
      "Save the brief to lock it in — next week's brief references it for accountability.",
    ],
  },
];

export type LearnProgressDTO = Record<string, string>; // chapterId -> ISO completion timestamp

export const updateLearnProgressSchema = z
  .object({
    chapterId: z.enum(LEARN_CHAPTERS.map((c) => c.id) as [string, ...string[]]),
    done: z.boolean(),
  })
  .strict();
export type UpdateLearnProgressInput = z.infer<typeof updateLearnProgressSchema>;
