/** Default student-facing copy — overridden by settings key `ui.copy`. */
export const UI_COPY_SETTING = "ui.copy";

export const DEFAULT_UI_COPY: Record<string, string> = {
  "card.blocked_account.helper": "Open your German blocked account (Sperrkonto) with Expatrio.",
  "card.sim.locked_helper": "Complete Blocked Account to unlock your SIM.",
  "card.jobs.notify_toast": "We’ll email you when Job References launches.",
  "card.jobs.notify_exists": "You’re already on the notify list.",
  "cta.continue": "Continue",
  "cta.notify_me": "Notify me",
  "commission.disclosure":
    "Blocked account is with Expatrio; health insurance with Fintiba. NIVO may receive a commission — this does not cost you extra. Your contract is with the partner.",
};

export function mergeUiCopy(stored: Record<string, string> | null | undefined): Record<string, string> {
  return { ...DEFAULT_UI_COPY, ...(stored ?? {}) };
}
