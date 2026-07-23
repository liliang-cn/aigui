import { describe, expect, it, vi } from "vitest"
import { STREAM_FIXTURES, createStreamSimulator } from "./index"

describe("stream simulator", () => {
  it("splits encoded bytes without corrupting UTF-8", async () => {
    const simulator = createStreamSimulator("A你🙂B", { chunkSize: 1, delayMs: 0 })
    const decoder = new TextDecoder()
    let output = ""
    for await (const chunk of simulator.stream) output += decoder.decode(chunk, { stream: true })
    output += decoder.decode()
    expect(output).toBe("A你🙂B")
  })

  it("pauses, resumes, delays, and cancels with iterator cleanup", async () => {
    vi.useFakeTimers()
    const simulator = createStreamSimulator("abcdef", { chunkSize: 2, delayMs: 10 })
    simulator.pause()
    const iterator = simulator.stream[Symbol.asyncIterator]()
    const first = iterator.next()
    await vi.advanceTimersByTimeAsync(100)
    let settled = false
    void first.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    simulator.resume()
    await vi.advanceTimersByTimeAsync(10)
    expect((await first).value).toEqual(new TextEncoder().encode("ab"))
    simulator.cancel()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(simulator.state()).toBe("cancelled")
    vi.useRealTimers()
  })

  it("ships deterministic markdown, card, and unicode fixtures", () => {
    expect(Object.keys(STREAM_FIXTURES)).toEqual(["markdown", "card", "unicode"])
    expect(STREAM_FIXTURES.card).toContain("```card:demo")
  })
})
