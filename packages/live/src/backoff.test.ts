import { describe, expect, it } from "vitest"
import { backoffMs } from "./backoff"

describe("backoffMs", () => {
  it("waits about a second after the first failure", () => {
    expect(backoffMs(0, () => 1)).toBe(1000)
  })

  it("doubles each attempt", () => {
    expect(backoffMs(1, () => 1)).toBe(2000)
    expect(backoffMs(2, () => 1)).toBe(4000)
    expect(backoffMs(3, () => 1)).toBe(8000)
  })

  it("caps so a long outage does not become a half-hour wait", () => {
    expect(backoffMs(20, () => 1)).toBe(30_000)
  })

  /**
   * Full jitter, not a fixed delay. Without it every client that dropped when the server
   * restarted comes back at the same instant and knocks it over again.
   */
  it("spreads clients across the window", () => {
    expect(backoffMs(3, () => 0)).toBe(0)
    expect(backoffMs(3, () => 0.5)).toBe(4000)
  })

  it("never returns a negative delay", () => {
    expect(backoffMs(0, () => 0)).toBeGreaterThanOrEqual(0)
  })
})
