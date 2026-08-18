const BASE_MS = 1000
const CAP_MS = 30_000

/**
 * How long to wait before reconnect attempt `attempt` (zero-based).
 *
 * Full jitter rather than a fixed delay: when a server restarts, every client it dropped is
 * waiting on the same schedule, and a fixed backoff brings them all back at the same instant.
 * `random` is injected so the policy is testable without flakiness.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt))
  return Math.round(ceiling * random())
}
