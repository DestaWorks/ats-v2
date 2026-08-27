import { describe, it, expect } from "vitest";
import { BASE_CLIENTS, BASE_CLIENT_RULES, HOT_SCORE } from "./clients";
import { CREDENTIALS, POPULATIONS, SETTINGS } from "./candidate";
import { US_STATES } from "./states";

/**
 * Guards the seed's data contract WITHOUT a DB: `db:seed:rules` resolves each rule's `clientId` by
 * looking up a seeded client whose `name` equals `clientName`, then upserts by that id. So every
 * `BASE_CLIENT_RULES` entry MUST map to exactly one `BASE_CLIENTS` row, and every scoring token must
 * be valid vocab (an unknown token would silently never match and mis-score). We simulate the seed's
 * name→id resolution over fake ids to prove each rule lands on the RIGHT client.
 */
describe("BASE_CLIENT_RULES ↔ BASE_CLIENTS alignment (seed contract)", () => {
  it("maps every rules entry to exactly the one client with that name (the seed's clientId lookup)", () => {
    // Fake seeded-client ids, keyed by name — exactly what the seed reads via findFirst({ name }).
    const idByName = new Map(BASE_CLIENTS.map((c, i) => [c.name, `client-${i}`] as const));
    for (const r of BASE_CLIENT_RULES) {
      const matches = BASE_CLIENTS.filter((c) => c.name === r.clientName);
      expect(matches, `"${r.clientName}" must match exactly one BASE_CLIENTS row`).toHaveLength(1);
      // The seed resolves a non-null clientId for this rule (upserts against exactly that id).
      expect(idByName.get(r.clientName)).toBeDefined();
    }
  });

  it("covers every base client exactly once (1:1 rules ↔ client)", () => {
    const names = BASE_CLIENT_RULES.map((r) => r.clientName).sort();
    expect(names).toEqual(BASE_CLIENTS.map((c) => c.name).sort());
    expect(new Set(names).size).toBe(names.length); // no duplicate rules per client
  });

  it("uses only known vocab for states/creds/pops/settings (no silent non-matching token)", () => {
    for (const r of BASE_CLIENT_RULES) {
      for (const s of r.states) expect(US_STATES).toContain(s);
      for (const c of r.creds) expect(CREDENTIALS as readonly string[]).toContain(c);
      for (const p of r.pops) expect(POPULATIONS as readonly string[]).toContain(p);
      for (const s of r.settings) expect(SETTINGS as readonly string[]).toContain(s);
    }
  });

  it("exposes HOT_SCORE = 80 (resolved OQ-1)", () => {
    expect(HOT_SCORE).toBe(80);
  });
});
