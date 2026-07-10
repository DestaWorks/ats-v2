/**
 * @mention parsing (pure, isomorphic — NO server imports). One regex, three consumers:
 * the note form's cursor-aware autocomplete, the SERVER-side resolution that creates mention
 * rows (never a client-supplied recipient list), and the safe renderer (`splitMentions` feeds
 * escaped React children — the legacy injected mention HTML via `dangerouslySetInnerHTML`,
 * the stored-XSS D-3 bans).
 *
 * Token grammar is the legacy parser's, verbatim: `@` + letter + [letters/digits/_/-]*. The
 * autocomplete inserts FIRST NAMES (legacy behavior), so resolution matches a token against a
 * user's lowercased first name or full name. Where we deliberately diverge from legacy:
 * ambiguous tokens (two users named Mike) resolve to NOBODY instead of notifying every Mike —
 * the picker inserts the hyphenated full name (`@Mike-Smith`, valid under the same grammar)
 * when the first name collides, so silence only hits hand-typed ambiguous tags.
 */

/** The legacy token grammar: `@` + letter + word chars/hyphens. */
export const MENTION_TOKEN_RE = /@([A-Za-z][A-Za-z0-9_-]*)/g;

/** A taggable user (id + display name; no emails client-side). */
export interface MentionTarget {
  id: string;
  name: string;
}

/** Unique lowercased `@tokens` in a note body, in order of first appearance. */
export function parseMentionTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    seen.add(match[1]!.toLowerCase());
  }
  return [...seen];
}

/** The token the autocomplete inserts for a user: first name, or hyphenated full name on collision. */
export function mentionToken(user: MentionTarget, all: readonly MentionTarget[]): string {
  const first = user.name.trim().split(/\s+/)[0]!;
  const collides = all.some(
    (u) => u.id !== user.id && u.name.trim().split(/\s+/)[0]!.toLowerCase() === first.toLowerCase(),
  );
  return collides ? user.name.trim().replace(/\s+/g, "-") : first;
}

/**
 * Resolve a note body's `@tokens` to users. A token matches a user when it equals their
 * lowercased FIRST name, full name, or hyphenated full name (`mike-smith` — what the picker
 * inserts on a first-name collision; spaces can't appear in a token). A token matching MORE
 * THAN ONE user resolves to nobody (see module doc); results are deduped by id and ordered by
 * first mention.
 */
export function resolveMentions(body: string, users: readonly MentionTarget[]): MentionTarget[] {
  const resolved: MentionTarget[] = [];
  const taken = new Set<string>();
  for (const token of parseMentionTokens(body)) {
    const matches = users.filter((u) => {
      const name = u.name.trim().toLowerCase();
      return (
        name === token || name.split(/\s+/)[0] === token || name.replace(/\s+/g, "-") === token
      );
    });
    if (matches.length !== 1) continue; // unknown or ambiguous → no notification
    const user = matches[0]!;
    if (!taken.has(user.id)) {
      taken.add(user.id);
      resolved.push(user);
    }
  }
  return resolved;
}

/** One run of note text: either a literal segment or an `@token` to highlight. */
export interface MentionSegment {
  text: string;
  mention: boolean;
}

/**
 * Split a body into literal/mention runs so the renderer can style `@tokens` with React
 * elements (escaped children) — never markup injection. Highlights ALL tokens, resolved or
 * not (matches the legacy render, which styled any `@word`).
 */
export function splitMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    const start = match.index;
    if (start > last) segments.push({ text: body.slice(last, start), mention: false });
    segments.push({ text: match[0], mention: true });
    last = start + match[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last), mention: false });
  return segments;
}
