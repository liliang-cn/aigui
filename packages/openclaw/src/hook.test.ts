import { describe, expect, it, vi } from "vitest"
import { createReplyPayloadHook } from "./hook"

const CHART = '```chart\n{"series":[{"type":"bar","data":[1,2]}]}\n```'

function deps(overrides: Record<string, unknown> = {}) {
  return {
    outDir: "/tmp/aigui",
    render: vi.fn(async () => ({ text: "Intro.", images: [{ kind: "chart", path: "/tmp/a.png", width: 1, height: 1 }] })),
    warn: vi.fn(),
    ...overrides,
  }
}

function event(payload: Record<string, unknown>, channel = "openclaw-weixin") {
  return { payload, channel, kind: "reply" as const }
}

describe("createReplyPayloadHook", () => {
  it("draws pictures for WeChat and rewrites the payload", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    const result = await hook(event({ text: `Intro.\n\n${CHART}` }), {})
    expect(d.render).toHaveBeenCalledOnce()
    expect(result?.payload?.mediaUrls).toEqual(["/tmp/a.png"])
    expect(result?.payload?.text).toBe("Intro.")
  })

  it("does nothing on a channel that is not configured", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: `Intro.\n\n${CHART}` }, "telegram"), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("does not touch the renderer for ordinary prose", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: "Just a sentence." }), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("skips reasoning, commentary, status and error payloads", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    for (const flag of ["isReasoning", "isCommentary", "isStatusNotice", "isError"]) {
      expect(await hook(event({ text: CHART, [flag]: true }), {})).toBeUndefined()
    }
    expect(d.render).not.toHaveBeenCalled()
  })

  it("skips a payload with no text", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ mediaUrl: "/tmp/x.png" }), {})).toBeUndefined()
    expect(d.render).not.toHaveBeenCalled()
  })

  it("leaves the reply untouched when rendering throws", async () => {
    const d = deps({
      render: vi.fn(async () => {
        throw new Error("chromium is not installed")
      }),
    })
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: CHART }), {})).toBeUndefined()
    expect(d.warn).toHaveBeenCalledOnce()
  })

  it("warns about a missing browser only once", async () => {
    const d = deps({
      render: vi.fn(async () => {
        throw new Error("chromium is not installed")
      }),
    })
    const hook = createReplyPayloadHook(d)
    await hook(event({ text: CHART }), {})
    await hook(event({ text: CHART }), {})
    await hook(event({ text: CHART }), {})
    expect(d.warn).toHaveBeenCalledOnce()
  })

  it("leaves the reply untouched when nothing rendered", async () => {
    const d = deps({ render: vi.fn(async () => ({ text: CHART, images: [] })) })
    const hook = createReplyPayloadHook(d)
    expect(await hook(event({ text: CHART }), {})).toBeUndefined()
  })

  it("passes the resolved config through to the renderer", async () => {
    const d = deps()
    const hook = createReplyPayloadHook(d)
    await hook({ ...event({ text: CHART }), context: { pluginConfig: { maxImages: 2, theme: "dark" } } }, {})
    expect(d.render).toHaveBeenCalledWith(
      CHART,
      expect.objectContaining({ max: 2, theme: "dark", outDir: "/tmp/aigui" }),
    )
  })
})
