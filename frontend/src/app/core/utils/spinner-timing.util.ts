export const DEFAULT_MIN_SPINNER_MS = 900;

export function delayRemaining(
  startedAtMs: number,
  minDurationMs: number = DEFAULT_MIN_SPINNER_MS
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const remaining = Math.max(0, minDurationMs - elapsed);
  if (remaining <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, remaining));
}
