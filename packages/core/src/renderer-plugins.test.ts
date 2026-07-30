import { describe, expect, it, vi } from "vitest"
import { CardRegistry } from "./card-registry"
import { Renderer } from "./renderer"
import { loadPlugins, samePlugins } from "./plugins"
import type { AIGuiPlugin, ASTNode, Patch } from "./types"

const widget: AIGuiPlugin = {
  name: "widget",
  nodeRenderers: { widget: () => ({ kind: "html", html: "<b>w</b>" }) },
}

describe("Renderer.setPlugins", () => {
  it("reparses what is already buffered under the new grammar", () => {
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("```widget\nhello\n```")
    // Before the plugin lands the fence is an ordinary code block.
    expect(snapshots.at(-1)?.[0]).toMatchObject({ type: "code" })

    r.setPlugins([widget])

    // No further push: the renderer still holds the text, so the host never replays it.
    expect(snapshots.at(-1)?.[0]).toMatchObject({ type: "widget", content: "hello\n" })
  })
  it("keeps parsing the same stream after the plugins arrive mid-answer", () => {
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("# Title\n\n```widget\nhal")
    r.setPlugins([widget])
    r.push("f\n```\n")
    const nodes = snapshots.at(-1) ?? []
    expect(nodes.map((node) => node.type)).toEqual(["heading", "widget"])
    expect(nodes[1].content).toBe("half\n")
  })
  it("dispatches the patches turning the old AST into the new one", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ onPatch })
    r.push("```widget\nhello\n```")
    onPatch.mockClear()
    r.setPlugins([widget])
    const patches: Patch[] = onPatch.mock.calls.at(-1)![0]
    expect(patches.some((patch) => patch.op === "update" || patch.op === "insert")).toBe(true)
  })
  it("is a no-op for the same plugins in a new array", () => {
    const onPatch = vi.fn()
    const r = new Renderer({ plugins: [widget], onPatch })
    r.push("```widget\nhello\n```")
    onPatch.mockClear()
    // A host re-rendering passes a fresh array holding the same plugin; redrawing for that would
    // tear down every mounted widget on screen.
    r.setPlugins([widget])
    expect(onPatch).not.toHaveBeenCalled()
  })
  it("registers the cards the new plugins bring", () => {
    const registry = new CardRegistry()
    const r = new Renderer({ registry })
    r.setPlugins([{ name: "carded", cards: [{ type: "poll", description: "A poll" }] }])
    expect(registry.has("poll")).toBe(true)
  })
  it("exposes the plugins currently in force", () => {
    const r = new Renderer()
    expect(r.plugins).toEqual([])
    r.setPlugins([widget])
    expect(r.plugins).toEqual([widget])
  })
  it("drops the plugins again when handed none", () => {
    const snapshots: ASTNode[][] = []
    const r = new Renderer({ plugins: [widget], onPatch: (_patches, nodes) => snapshots.push(nodes) })
    r.push("```widget\nhello\n```")
    expect(snapshots.at(-1)?.[0]?.type).toBe("widget")
    r.setPlugins(undefined)
    expect(snapshots.at(-1)?.[0]?.type).toBe("code")
  })
  it("emits a debug event naming the plugins", () => {
    const onDebugEvent = vi.fn()
    const r = new Renderer({ debug: true, onDebugEvent })
    r.setPlugins([widget])
    expect(onDebugEvent.mock.calls.map(([event]) => event.type)).toContain("plugins-changed")
  })
})

describe("loadPlugins", () => {
  it("returns an array source synchronously so the first chunk is not drawn twice", () => {
    expect(loadPlugins([widget])).toEqual([widget])
  })
  it("returns [] for no source", () => {
    expect(loadPlugins()).toEqual([])
  })
  it("calls a loader and passes its promise through", async () => {
    const loaded = loadPlugins(() => Promise.resolve([widget]))
    expect(Array.isArray(loaded)).toBe(false)
    await expect(loaded).resolves.toEqual([widget])
  })
  it("passes a synchronous loader's plugins through as an array", () => {
    expect(loadPlugins(() => [widget])).toEqual([widget])
  })
})

describe("samePlugins", () => {
  it("treats the same members in the same order as unchanged", () => {
    expect(samePlugins([widget], [widget])).toBe(true)
    expect(samePlugins(undefined, undefined)).toBe(true)
  })
  it("treats a different member, order, length or absence as a change", () => {
    const other: AIGuiPlugin = { name: "other" }
    expect(samePlugins([widget], [other])).toBe(false)
    expect(samePlugins([widget, other], [other, widget])).toBe(false)
    expect(samePlugins([widget], [widget, other])).toBe(false)
    expect(samePlugins(undefined, [widget])).toBe(false)
  })
})
