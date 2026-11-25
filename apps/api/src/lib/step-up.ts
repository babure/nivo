/** Process-local step-up timestamps keyed by session id (REQ-ADM-05). */
const stepUpAt = new Map<string, number>();

export const STEP_UP_TTL_MS = 5 * 60 * 1000;

export function markStepUp(sessionId: string, at = Date.now()): void {
  stepUpAt.set(sessionId, at);
}

export function clearStepUp(sessionId: string): void {
  stepUpAt.delete(sessionId);
}

export function getStepUpAt(sessionId: string): number | undefined {
  return stepUpAt.get(sessionId);
}

export function isStepUpFresh(sessionId: string, now = Date.now()): boolean {
  const at = stepUpAt.get(sessionId);
  return Boolean(at && now - at <= STEP_UP_TTL_MS);
}

export function clearAllStepUps(): void {
  stepUpAt.clear();
}
