import { describe, expect, it } from "vitest"
import { rewritePayload } from "./rewrite"

describe("rewritePayload", () => {
  it("replaces the text and appends the pictures", () => {
    const result = rewritePayload({ text: "old" }, "Intro.\n\nOutro.", ["/tmp/a.png"])
    expect(result.text).toBe("Intro.\n\nOutro.")
    expect(result.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("keeps media the payload already carried, pictures last", () => {
    const result = rewritePayload({ text: "x", mediaUrls: ["/tmp/voice.ogg"] }, "y", ["/tmp/a.png"])
    expect(result.mediaUrls).toEqual(["/tmp/voice.ogg", "/tmp/a.png"])
  })

  it("folds a single existing mediaUrl into the list", () => {
    const result = rewritePayload({ text: "x", mediaUrl: "/tmp/one.png" }, "y", ["/tmp/a.png"])
    expect(result.mediaUrls).toEqual(["/tmp/one.png", "/tmp/a.png"])
    expect(result.mediaUrl).toBeUndefined()
  })

  it("drops the text entirely when the message was nothing but a picture", () => {
    const result = rewritePayload({ text: "```chart\n{}\n```" }, "", ["/tmp/a.png"])
    expect(result.text).toBeUndefined()
    expect(result.mediaUrls).toEqual(["/tmp/a.png"])
  })

  it("leaves the payload alone when nothing was drawn", () => {
    const payload = { text: "hello", replyToId: "42" }
    expect(rewritePayload(payload, "hello", [])).toBe(payload)
  })

  it("preserves unrelated payload fields", () => {
    const result = rewritePayload({ text: "x", replyToId: "42", isReasoning: false }, "y", ["/tmp/a.png"])
    expect(result.replyToId).toBe("42")
    expect(result.isReasoning).toBe(false)
  })
})
