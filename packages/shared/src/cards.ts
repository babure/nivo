export const CARD_STATUSES = [
  "locked",
  "available",
  "in_progress",
  "completed",
  "coming_soon",
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export type CardProgress = {
  cardKey: string;
  status: CardStatus;
};

export type SimUnlockInput = {
  paymentPaid: boolean;
  identityComplete: boolean;
  requiredCardKeys: string[];
  progress: CardProgress[];
  /** Current SIM status before evaluation */
  simStatus: CardStatus;
};

/**
 * Grandfathering: if SIM is already unlocked (available after unlock),
 * in_progress, or completed, never relock when rules change.
 */
export function isSimGrandfathered(simStatus: CardStatus): boolean {
  return (
    simStatus === "available" ||
    simStatus === "in_progress" ||
    simStatus === "completed"
  );
}

export function evaluateSimUnlock(input: SimUnlockInput): CardStatus {
  if (!input.paymentPaid) return "locked";

  if (isSimGrandfathered(input.simStatus)) {
    return input.simStatus;
  }

  const completed = new Set(
    input.progress
      .filter((p) => p.status === "completed")
      .map((p) => p.cardKey),
  );

  const allRequiredDone = input.requiredCardKeys.every((k) =>
    completed.has(k),
  );

  return allRequiredDone ? "available" : "locked";
}

export function simProgress(input: {
  requiredCardKeys: string[];
  progress: CardProgress[];
}): { done: number; total: number } {
  const completed = new Set(
    input.progress
      .filter((p) => p.status === "completed")
      .map((p) => p.cardKey),
  );
  const done = input.requiredCardKeys.filter((k) => completed.has(k)).length;
  return { done, total: input.requiredCardKeys.length };
}

const ALLOWED: Record<CardStatus, CardStatus[]> = {
  locked: ["available", "coming_soon"],
  available: ["in_progress", "locked", "coming_soon"],
  in_progress: ["completed", "available"],
  completed: [],
  coming_soon: ["available", "locked"],
};

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function dashboardCardAvailability(input: {
  paymentPaid: boolean;
  identityComplete: boolean;
  cardKey: string;
  requiredForSim: string[];
  progress: CardProgress[];
  comingSoon: boolean;
}): CardStatus {
  if (input.comingSoon) return "coming_soon";
  if (!input.paymentPaid) return "locked";

  const existing = input.progress.find((p) => p.cardKey === input.cardKey);
  if (existing && (existing.status === "in_progress" || existing.status === "completed")) {
    return existing.status;
  }

  if (input.cardKey === "blocked_account" && !input.identityComplete) {
    return "locked";
  }

  if (input.cardKey === "sim") {
    return evaluateSimUnlock({
      paymentPaid: input.paymentPaid,
      identityComplete: input.identityComplete,
      requiredCardKeys: input.requiredForSim,
      progress: input.progress,
      simStatus: existing?.status ?? "locked",
    });
  }

  // accommodation and blocked_account (with identity): available after pay
  if (input.cardKey === "blocked_account" || input.cardKey === "accommodation") {
    return "available";
  }

  return existing?.status ?? "locked";
}
