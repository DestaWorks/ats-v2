import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { statusOrder, type CandidateStatus } from "@/lib/constants";

/**
 * Seed DEMO candidates for local/staging testing — clearly FAKE data (no real PII), tagged with a
 * `demo-*` legacyId so it is idempotent (re-runnable) AND trivially purged before the real Sheet
 * ETL (Wave 1.3): `DELETE FROM candidates WHERE legacy_id LIKE 'demo-%'`. Inserts directly via
 * Prisma (bypasses the stage gate on purpose — this is fixture data, not a real transition).
 */

type DemoCandidate = {
  legacyId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  track: "Clinical" | "Prescriber" | "Operations";
  credential: string | null;
  licenseState: string | null;
  licenseStatus: string;
  population: string | null;
  setting: string | null;
  status: CandidateStatus;
  clientIndex: number | null; // index into the seeded clients (null = unassigned)
  daysInStage: number;
};

const DEMO: DemoCandidate[] = [
  {
    legacyId: "demo-001",
    name: "Amina Bekele",
    email: "amina.demo@example.com",
    phone: "555-0101",
    city: "Newark",
    state: "NJ",
    track: "Prescriber",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    status: "NEW_CANDIDATE",
    clientIndex: 0,
    daysInStage: 1,
  },
  {
    legacyId: "demo-002",
    name: "Daniel Okoro",
    email: "daniel.demo@example.com",
    phone: "555-0102",
    city: "Hartford",
    state: "CT",
    track: "Clinical",
    credential: "LCSW",
    licenseState: "CT",
    licenseStatus: "Active",
    population: "Child/Adolescent",
    setting: "Outpatient",
    status: "QUALIFIED_PRESCREEN",
    clientIndex: 0,
    daysInStage: 3,
  },
  {
    legacyId: "demo-003",
    name: "Sara Meles",
    email: "sara.demo@example.com",
    phone: "555-0103",
    city: "Austin",
    state: "TX",
    track: "Prescriber",
    credential: "MD",
    licenseState: "TX",
    licenseStatus: "Not Verified",
    population: "Adult",
    setting: "Hybrid",
    status: "CLIENT_INTERVIEW",
    clientIndex: 1,
    daysInStage: 6,
  },
  {
    legacyId: "demo-004",
    name: "James Carter",
    email: "james.demo@example.com",
    phone: "555-0104",
    city: "Denver",
    state: "CO",
    track: "Clinical",
    credential: "PsyD",
    licenseState: "CO",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    status: "OFFER_ACCEPTED",
    clientIndex: 1,
    daysInStage: 2,
  },
  {
    legacyId: "demo-005",
    name: "Lily Nguyen",
    email: "lily.demo@example.com",
    phone: "555-0105",
    city: "Miami",
    state: "FL",
    track: "Prescriber",
    credential: "NP",
    licenseState: "FL",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    status: "STARTED_DAY1",
    clientIndex: 2,
    daysInStage: 0,
  },
  {
    legacyId: "demo-006",
    name: "Mekdes Alemu",
    email: "mekdes.demo@example.com",
    phone: "555-0106",
    city: "Addis Ababa",
    state: "",
    track: "Operations",
    credential: null,
    licenseState: null,
    licenseStatus: "Not Verified",
    population: null,
    setting: null,
    status: "NEW_CANDIDATE",
    clientIndex: null,
    daysInStage: 4,
  },
  {
    legacyId: "demo-007",
    name: "Robert Feld",
    email: "robert.demo@example.com",
    phone: "555-0107",
    city: "Trenton",
    state: "NJ",
    track: "Clinical",
    credential: "LCSW",
    licenseState: "NJ",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Outpatient",
    status: "QUALIFIED_PRESCREEN",
    clientIndex: 3,
    daysInStage: 9,
  },
  {
    legacyId: "demo-008",
    name: "Hanna Girma",
    email: "hanna.demo@example.com",
    phone: "555-0108",
    city: "Stamford",
    state: "CT",
    track: "Prescriber",
    credential: "PMHNP",
    licenseState: "CT",
    licenseStatus: "Active",
    population: "Child/Adolescent",
    setting: "Telehealth",
    status: "CLIENT_INTERVIEW",
    clientIndex: 0,
    daysInStage: 5,
  },
  {
    legacyId: "demo-009",
    name: "Marcus Lee",
    email: "marcus.demo@example.com",
    phone: "555-0109",
    city: "Houston",
    state: "TX",
    track: "Operations",
    credential: null,
    licenseState: null,
    licenseStatus: "Not Verified",
    population: null,
    setting: null,
    status: "NEW_CANDIDATE",
    clientIndex: 4,
    daysInStage: 2,
  },
  {
    legacyId: "demo-010",
    name: "Yohannes Tadesse",
    email: "yohannes.demo@example.com",
    phone: "555-0110",
    city: "Denver",
    state: "CO",
    track: "Clinical",
    credential: "PsyD",
    licenseState: "CO",
    licenseStatus: "Not Verified",
    population: "Adult",
    setting: "Hybrid",
    status: "OFFER_ACCEPTED",
    clientIndex: 1,
    daysInStage: 1,
  },
];

async function main() {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
  const now = Date.now();

  for (const c of DEMO) {
    const client = c.clientIndex != null ? clients[c.clientIndex] : undefined;
    const clientId = client?.id ?? null;
    const stageEnteredAt = new Date(now - c.daysInStage * 24 * 60 * 60 * 1000);
    const data = {
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      state: c.state,
      track: c.track,
      credential: c.credential,
      licenseState: c.licenseState,
      licenseStatus: c.licenseStatus,
      population: c.population,
      setting: c.setting,
      source: "Demo Seed",
      status: c.status,
      stageOrder: statusOrder(c.status),
      stageEnteredAt,
      placedAt: c.status === "STARTED_DAY1" ? stageEnteredAt : null,
      clientId,
      createdById: "seed",
    };
    await prisma.candidate.upsert({
      where: { legacyId: c.legacyId },
      create: { legacyId: c.legacyId, ...data },
      update: data,
    });
    console.log(`✓ ${c.name} — ${c.status}${client ? " @ " + client.name : ""}`);
  }
  console.log(
    `Done — ${DEMO.length} demo candidates upserted (purge with legacy_id LIKE 'demo-%').`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
