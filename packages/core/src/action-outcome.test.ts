import { describe, expect, it } from "vitest"
import { actionOutcome } from "./action-outcome"

describe("actionOutcome", () => {
  it("reads a verdict a handler returned on its own", () => {
    expect(actionOutcome({ tone: "warning", message: "差一点，再看极限的定义" })).toEqual({
      tone: "warning",
      message: "差一点，再看极限的定义",
    })
  })

  it("reads one returned beside the handler's own data", () => {
    // A handler answers with its own result type; the verdict rides along rather than replacing it.
    expect(actionOutcome({ submitted: true, outcome: { tone: "positive" } })).toEqual({ tone: "positive" })
  })

  it("marks the field the wrong answer came from, not the whole form", () => {
    const outcome = actionOutcome({ outcome: { tone: "warning", fields: { answer: "warning", name: "positive", bad: "nope" } } })
    expect(outcome?.fields).toEqual({ answer: "warning", name: "positive" })
  })

  it("says nothing when the handler did not judge", () => {
    // Most actions have no verdict to give, and inventing "success means correct" would light up
    // every submitted form as if it had been marked.
    for (const value of [undefined, null, "ok", 42, {}, { submitted: true }, { tone: "green" }]) {
      expect(actionOutcome(value)).toBeUndefined()
    }
  })

  it("drops an empty message rather than showing a blank line", () => {
    expect(actionOutcome({ tone: "negative", message: "   " })).toEqual({ tone: "negative" })
  })
})
