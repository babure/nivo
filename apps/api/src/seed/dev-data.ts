import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { createArgon2Hasher } from "../modules/auth/service.js";
import { InMemoryRepositories } from "../repositories/memory.js";
import { PostgresRepositories } from "../repositories/postgres.js";
import type { Repositories } from "../repositories/types.js";
import type { Services } from "../services.js";

type SeedRepos = (InMemoryRepositories | PostgresRepositories) & Repositories;

/** Shared password for every seeded account (dev only). */
export const SEED_PASSWORD = "NivoTest1234";

/** Stable UUIDs so credentials sheets and deep links stay usable across restarts. */
export const SEED_IDS = {
  consultancies: {
    berlinEdu: "d0000001-0000-4000-8000-000000000001",
    mumbaiPath: "d0000001-0000-4000-8000-000000000002",
  },
  leads: {
    berlinRoom: "e0000001-0000-4000-8000-000000000001",
    munichStudio: "e0000001-0000-4000-8000-000000000002",
  },
  students: {
    unpaid: "a0000001-0000-4000-8000-000000000001",
    paidOnly: "a0000001-0000-4000-8000-000000000002",
    dashboard: "a0000001-0000-4000-8000-000000000003",
    simReady: "a0000001-0000-4000-8000-000000000004",
    fullJourney: "a0000001-0000-4000-8000-000000000005",
    referredShared: "a0000001-0000-4000-8000-000000000006",
    referredPrivate: "a0000001-0000-4000-8000-000000000007",
    unverified: "a0000001-0000-4000-8000-000000000008",
  },
  staff: {
    superAdmin: "b0000001-0000-4000-8000-000000000001",
  },
  consultancyUsers: {
    berlinMember: "c0000001-0000-4000-8000-000000000001",
  },
} as const;

type SeedAccount = {
  id: string;
  email: string;
  fullName: string;
  role: string | null;
  phone?: string;
  country?: string;
  intake?: string;
  verified?: boolean;
  flow: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    id: SEED_IDS.students.unpaid,
    email: "unpaid@nivo.test",
    fullName: "Uma Unpaid",
    role: null,
    flow: "Verified, unpaid → /pay",
  },
  {
    id: SEED_IDS.students.paidOnly,
    email: "paid@nivo.test",
    fullName: "Priya Paid",
    role: null,
    flow: "Paid, identity incomplete → /onboarding/identity",
  },
  {
    id: SEED_IDS.students.dashboard,
    email: "dashboard@nivo.test",
    fullName: "Dev Dashboard",
    role: null,
    flow: "Paid + identity → /dashboard (cards available)",
  },
  {
    id: SEED_IDS.students.simReady,
    email: "simready@nivo.test",
    fullName: "Sam Simready",
    role: null,
    flow: "Blocked account completed → SIM unlocked",
  },
  {
    id: SEED_IDS.students.fullJourney,
    email: "full@nivo.test",
    fullName: "Fay Fulljourney",
    role: null,
    flow: "SIM done + accommodation lead + invoice",
  },
  {
    id: SEED_IDS.students.referredShared,
    email: "shared@nivo.test",
    fullName: "Rita Referred",
    role: null,
    flow: "Berlin Edu referral, progress shared",
  },
  {
    id: SEED_IDS.students.referredPrivate,
    email: "private@nivo.test",
    fullName: "Paul Private",
    role: null,
    flow: "Berlin Edu referral, progress NOT shared",
  },
  {
    id: SEED_IDS.students.unverified,
    email: "unverified@nivo.test",
    fullName: "Uri Unverified",
    role: null,
    verified: false,
    flow: "Registered, email not verified (login blocked)",
  },
  {
    id: SEED_IDS.staff.superAdmin,
    email: "admin@nivo.test",
    fullName: "Ada Superadmin",
    role: "super_admin",
    flow: "Super admin — full ops → /admin",
  },
  {
    id: SEED_IDS.consultancyUsers.berlinMember,
    email: "consultancy@nivo.test",
    fullName: "Ben Berlinedu",
    role: "consultancy",
    flow: "Consultancy portal → /consultancy",
  },
];

function formatSeedTable(): string {
  const lines = [
    "",
    "══════════════════════════════════════════════════════════════",
    " NIVO DEV SEED — password for all accounts: " + SEED_PASSWORD,
    "══════════════════════════════════════════════════════════════",
    "",
    "STUDENTS",
    ...SEED_ACCOUNTS.filter((a) => a.role === null).map(
      (a) => `  ${a.email.padEnd(24)} ${a.id}  ${a.flow}`,
    ),
    "",
    "SUPER ADMIN (login at /admin/login)",
    ...SEED_ACCOUNTS.filter((a) => a.role === "super_admin").map(
      (a) => `  ${a.email.padEnd(24)} ${a.id}  ${a.flow}`,
    ),
    "",
    "CONSULTANCY",
    ...SEED_ACCOUNTS.filter((a) => a.role === "consultancy").map(
      (a) => `  ${a.email.padEnd(24)} ${a.id}  ${a.flow}`,
    ),
    "",
    "ORGS / REFERRALS",
    `  Berlin Edu Hub     id=${SEED_IDS.consultancies.berlinEdu}  code=BERLINEDU  link=/r/BERLINEDU`,
    `  Mumbai Path        id=${SEED_IDS.consultancies.mumbaiPath}  code=MUMBAIPATH  link=/r/MUMBAIPATH`,
    "",
    "LEADS",
    `  ${SEED_IDS.leads.berlinRoom}  Berlin room (new) — student full@nivo.test`,
    `  ${SEED_IDS.leads.munichStudio}  Munich studio (contacted) — student simready@nivo.test`,
    "══════════════════════════════════════════════════════════════",
    "",
  ];
  return lines.join("\n");
}

async function createUser(
  repos: SeedRepos,
  passwordHash: string,
  account: SeedAccount,
  now: Date,
): Promise<void> {
  await repos.users.create({
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    phone: account.phone ?? "+491701000001",
    country: account.country ?? "India",
    intake: account.intake ?? "Winter 2026",
    passwordHash,
    emailVerifiedAt: account.verified === false ? null : now,
    role: account.role,
    googleSub: null,
    avatarUrl: null,
    passwordSet: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    deletedAt: null,
  });
}

async function studentProfile(
  repos: SeedRepos,
  userId: string,
  patch: {
    paymentStatus?: "unpaid" | "paid";
    identityComplete?: boolean;
    consultancyId?: string | null;
    referralCode?: string | null;
    shareProgressWithConsultancy?: boolean;
  },
  now: Date,
): Promise<void> {
  const paid = patch.paymentStatus === "paid";
  await repos.profiles.upsert({
    userId,
    paymentStatus: patch.paymentStatus ?? "unpaid",
    paidAt: paid ? now : null,
    identityComplete: patch.identityComplete ?? false,
    consultancyId: patch.consultancyId ?? null,
    referralCode: patch.referralCode ?? null,
    shareProgressWithConsultancy: patch.shareProgressWithConsultancy ?? false,
  });
  await repos.consents.add({
    id: randomUUID(),
    userId,
    kind: "terms",
    version: "2025-11-draft1",
    ipHash: null,
    acceptedAt: now,
  });
  await repos.consents.add({
    id: randomUUID(),
    userId,
    kind: "privacy",
    version: "2025-11-draft1",
    ipHash: null,
    acceptedAt: now,
  });
}

async function markPaidWithInvoice(
  services: Services,
  userId: string,
  actorId: string,
  _now: Date,
): Promise<void> {
  await services.payments.markPaidManually(userId, actorId, "Dev seed: mark paid for navigation.");
}

async function saveIdentity(services: Services, userId: string, fullName: string, passport: string): Promise<void> {
  await services.identity.save(userId, {
    fullName,
    fatherName: "Father Name",
    motherName: "Mother Name",
    phone: "+491701000099",
    email: `${userId.slice(0, 8)}@identity.nivo.test`,
    currentAddress: {
      street: "Hauptstrasse",
      houseNumber: "12",
      city: "Berlin",
      postalCode: "10115",
      country: "Germany",
    },
    permanentAddress: {
      street: "MG Road",
      houseNumber: "45",
      city: "Bengaluru",
      postalCode: "560001",
      country: "India",
    },
    permanentSameAsCurrent: false,
    passportNumber: passport,
    identityConsent: true,
  });
}

/** Walk allowed transitions: available → in_progress → completed. */
async function completeCard(services: Services, userId: string, cardKey: string, actorId: string): Promise<void> {
  const opts = { actorId, bypassStudentLimits: true };
  await services.cards.setStatus(userId, cardKey, "in_progress", opts);
  await services.cards.setStatus(userId, cardKey, "completed", opts);
}

/**
 * Populates the in-memory store with fixed personas covering student, admin,
 * consultancy, payment, identity, cards, leads, and referral flows.
 */
export async function seedDevData(
  services: Services,
  config: AppConfig,
  repos: SeedRepos,
): Promise<string> {
  const existing = await repos.users.findByEmail("admin@nivo.test");
  if (existing) return formatSeedTable();

  const now = new Date();
  const hasher = createArgon2Hasher({
    memoryCost: config.ARGON2_MEMORY_KIB,
    timeCost: config.ARGON2_TIME_COST,
  });
  const passwordHash = await hasher.hash(SEED_PASSWORD);

  for (const account of SEED_ACCOUNTS) {
    await createUser(repos, passwordHash, account, now);
  }

  // Consultancies + membership
  await repos.seedConsultancy("Berlin Edu Hub", "BERLINEDU", SEED_IDS.consultancyUsers.berlinMember, {
    id: SEED_IDS.consultancies.berlinEdu,
    memberRole: "owner",
  });
  await repos.seedConsultancy("Mumbai Path", "MUMBAIPATH", undefined, {
    id: SEED_IDS.consultancies.mumbaiPath,
  });

  const berlin = SEED_IDS.consultancies.berlinEdu;
  const adminId = SEED_IDS.staff.superAdmin;

  // ── Student journey states (profile unpaid first, then mark paid) ───────
  await studentProfile(repos, SEED_IDS.students.unpaid, { paymentStatus: "unpaid" }, now);
  await studentProfile(repos, SEED_IDS.students.unverified, { paymentStatus: "unpaid" }, now);

  await studentProfile(repos, SEED_IDS.students.paidOnly, { paymentStatus: "unpaid" }, now);
  await markPaidWithInvoice(services, SEED_IDS.students.paidOnly, adminId, now);

  await studentProfile(repos, SEED_IDS.students.dashboard, { paymentStatus: "unpaid" }, now);
  await markPaidWithInvoice(services, SEED_IDS.students.dashboard, adminId, now);
  await saveIdentity(services, SEED_IDS.students.dashboard, "Dev Dashboard", "A1234567");

  await studentProfile(repos, SEED_IDS.students.simReady, { paymentStatus: "unpaid" }, now);
  await markPaidWithInvoice(services, SEED_IDS.students.simReady, adminId, now);
  await saveIdentity(services, SEED_IDS.students.simReady, "Sam Simready", "B2345678");
  await completeCard(services, SEED_IDS.students.simReady, "blocked_account", adminId);

  await studentProfile(repos, SEED_IDS.students.fullJourney, { paymentStatus: "unpaid" }, now);
  await markPaidWithInvoice(services, SEED_IDS.students.fullJourney, adminId, now);
  await saveIdentity(services, SEED_IDS.students.fullJourney, "Fay Fulljourney", "C3456789");
  await completeCard(services, SEED_IDS.students.fullJourney, "blocked_account", adminId);
  await completeCard(services, SEED_IDS.students.fullJourney, "sim", adminId);
  await services.cards.setStatus(SEED_IDS.students.fullJourney, "accommodation", "in_progress", {
    actorId: SEED_IDS.students.fullJourney,
  });

  await studentProfile(
    repos,
    SEED_IDS.students.referredShared,
    {
      paymentStatus: "unpaid",
      consultancyId: berlin,
      referralCode: "BERLINEDU",
      shareProgressWithConsultancy: true,
    },
    now,
  );
  await markPaidWithInvoice(services, SEED_IDS.students.referredShared, adminId, now);
  await saveIdentity(services, SEED_IDS.students.referredShared, "Rita Referred", "D4567890");
  await repos.consents.add({
    id: randomUUID(),
    userId: SEED_IDS.students.referredShared,
    kind: "consultancy_share",
    version: "1",
    ipHash: null,
    acceptedAt: now,
  });

  await studentProfile(
    repos,
    SEED_IDS.students.referredPrivate,
    {
      paymentStatus: "unpaid",
      consultancyId: berlin,
      referralCode: "BERLINEDU",
      shareProgressWithConsultancy: false,
    },
    now,
  );

  // ── Accommodation leads ─────────────────────────────────────────────────
  await repos.leads.create({
    id: SEED_IDS.leads.berlinRoom,
    userId: SEED_IDS.students.fullJourney,
    city: "Berlin",
    budget: "600-800 EUR",
    roomType: "shared",
    notes: "Near campus, available from March.",
    phone: "+491701000005",
    status: "new",
    createdAt: now,
    updatedAt: now,
  });
  await repos.leads.create({
    id: SEED_IDS.leads.munichStudio,
    userId: SEED_IDS.students.simReady,
    city: "Munich",
    budget: "900 EUR",
    roomType: "studio",
    notes: "Prefers quiet neighbourhood.",
    phone: "+491701000004",
    status: "contacted",
    createdAt: now,
    updatedAt: now,
  });
  await repos.leads.addNote({
    id: randomUUID(),
    leadId: SEED_IDS.leads.munichStudio,
    authorId: adminId,
    body: "Called student — viewing scheduled next week.",
    createdAt: now,
  });

  // ── Partner clicks + deletion request sample ────────────────────────────
  await repos.clicks.record({
    linkKey: "expatrio",
    userId: SEED_IDS.students.simReady,
    ipHash: null,
    at: now,
  });
  await repos.clicks.record({
    linkKey: "vodafone",
    userId: SEED_IDS.students.fullJourney,
    ipHash: null,
    at: now,
  });
  await repos.requests.addDeletionRequest(SEED_IDS.students.unpaid, now);

  await services.audit.append({
    actorId: adminId,
    action: "seed.dev_data",
    entityType: "system",
    entityId: null,
    meta: { accounts: SEED_ACCOUNTS.length },
  });

  return formatSeedTable();
}
