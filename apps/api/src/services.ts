import type { AppConfig } from "./config.js";
import { AuditLogger } from "./lib/audit.js";
import type { Mailer } from "./lib/mailer.js";
import { AccommodationService } from "./modules/accommodation/service.js";
import { ConsultancyService } from "./modules/consultancy/service.js";
import { AuthService, createArgon2Hasher, type PasswordHasher } from "./modules/auth/service.js";
import { CardsService } from "./modules/cards/service.js";
import { IdentityService } from "./modules/identity/service.js";
import { PaymentsService } from "./modules/payments/service.js";
import type { Repositories } from "./repositories/types.js";

export type Services = {
  repos: Repositories;
  audit: AuditLogger;
  mailer: Mailer;
  auth: AuthService;
  payments: PaymentsService;
  cards: CardsService;
  identity: IdentityService;
  accommodation: AccommodationService;
  consultancy: ConsultancyService;
};

export function buildServices(deps: {
  config: AppConfig;
  repos: Repositories;
  mailer: Mailer;
  hasher?: PasswordHasher;
  now?: () => Date;
  /** Stripe charge used at Checkout (settlement currency when ≠ EUR). */
  feeCents?: number;
  feeCurrency?: string;
}): Services {
  const { config, repos, mailer } = deps;
  const audit = new AuditLogger(repos.audit, deps.now);
  const hasher =
    deps.hasher ??
    createArgon2Hasher({
      memoryCost: config.ARGON2_MEMORY_KIB,
      timeCost: config.ARGON2_TIME_COST,
    });
  const cards = new CardsService({ repos, audit, mailer });
  return {
    repos,
    audit,
    mailer,
    auth: new AuthService({
      repos,
      mailer,
      hasher,
      audit,
      encryptionSecret: config.IDENTITY_ENCRYPTION_KEY,
      now: deps.now,
    }),
    payments: new PaymentsService({
      repos,
      audit,
      cards,
      mailer,
      now: deps.now,
      feeCents: deps.feeCents,
      feeCurrency: deps.feeCurrency,
    }),
    cards,
    identity: new IdentityService({
      repos,
      audit,
      encryptionSecret: config.IDENTITY_ENCRYPTION_KEY,
      now: deps.now,
    }),
    accommodation: new AccommodationService({ repos, audit, mailer, cards }),
    consultancy: new ConsultancyService(repos),
  };
}
