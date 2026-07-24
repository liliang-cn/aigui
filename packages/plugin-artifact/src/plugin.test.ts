import { Renderer, collectNodeRenderers, createParser, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { describe, expect, it, vi } from "vitest"
import { ArtifactStore, artifact, artifactPromptSpec } from "./index"

const createCommand = (id: string, operationId = `create-${id}`, content = id) => JSON.stringify({
  version: 1,
  operationId,
  artifact: { id, title: id, filename: `${id}.txt`, kind: "text", content },
})
const updateCommand = (id: string, baseRevision: number, content: string, operationId = `update-${id}-${baseRevision}`) => JSON.stringify({
  version: 1, operationId, id, baseRevision, content,
})

describe("artifact plugin commits", () => {
  it("does not commit incomplete commands and commits closed commands before patches", () => {
    const store = new ArtifactStore()
    const plugin = artifact({ store })
    const observations: Array<string | undefined> = []
    const renderer = new Renderer({ plugins: [plugin], onPatch: () => observations.push(store.get("one")?.content) })
    renderer.push(`\`\`\`artifact-create\n${createCommand("one")}`)
    expect(store.get("one")).toBeUndefined()
    renderer.push("\n```")
    expect(observations.at(-1)).toBe("one")
  })

  it("processes complete commands in AST source order", () => {
    const store = new ArtifactStore()
    const renderer = new Renderer({ plugins: [artifact({ store })] })
    renderer.push(`\`\`\`artifact-create\n${createCommand("one")}\n\`\`\`\n\n\`\`\`artifact-update\n${updateCommand("one", 0, "updated")}\n\`\`\``)
    expect(store.get("one")).toMatchObject({ revision: 1, content: "updated" })
  })

  it("replay and renderer reset remain idempotent", () => {
    const store = new ArtifactStore()
    const plugin = artifact({ store })
    const renderer = new Renderer({ plugins: [plugin] })
    const source = `\`\`\`artifact-create\n${createCommand("one")}\n\`\`\``
    renderer.push(source)
    renderer.push("\n")
    renderer.reset()
    renderer.push(source)
    expect(store.get("one")?.revision).toBe(0)
  })

  it("uses the first valid create as the sole workspace anchor and caches outputs by node", () => {
    const store = new ArtifactStore()
    const plugin = artifact({ store })
    const nodes = createParser({ plugins: [plugin] })(`\`\`\`artifact-create\n${createCommand("one")}\n\`\`\`\n\n\`\`\`artifact-create\n${createCommand("two")}\n\`\`\``)
    plugin.onASTCommit?.(nodes, { generation: 0, emitDebug: vi.fn() })
    const renderers = collectNodeRenderers([plugin])
    const first = renderers["artifact-create"](nodes[0]) as RenderOutput
    expect(first.kind).toBe("mount")
    expect(renderers["artifact-create"](nodes[0])).toBe(first)
    const second = renderers["artifact-create"](nodes[1]) as RenderOutput
    expect(second.kind).not.toBe("mount")
  })

  it("anchors the first create that actually commits, not a conflicting create", () => {
    const store = new ArtifactStore()
    store.create(JSON.parse(createCommand("one")))
    const plugin = artifact({ store })
    const nodes = createParser({ plugins: [plugin] })(`\`\`\`artifact-create\n${createCommand("one", "different-op")}\n\`\`\`\n\n\`\`\`artifact-create\n${createCommand("two")}\n\`\`\``)
    plugin.onASTCommit?.(nodes, { generation: 0, emitDebug: vi.fn() })
    const renderers = collectNodeRenderers([plugin])
    expect((renderers["artifact-create"](nodes[0]) as RenderOutput).kind).not.toBe("mount")
    expect((renderers["artifact-create"](nodes[1]) as RenderOutput).kind).toBe("mount")
  })

  it("renders only generic status for invalid commands and exposes detailed parser issues separately", () => {
    const plugin = artifact()
    const node: ASTNode = { key: "bad", type: "artifact-create", complete: true, content: '{"secret":"value"}' }
    plugin.onASTCommit?.([node], { generation: 0, emitDebug: vi.fn() })
    const out = collectNodeRenderers([plugin])["artifact-create"](node) as RenderOutput
    expect(out.kind).toBe("element")
    expect(JSON.stringify(out)).not.toContain("secret")
  })

  it("builds dynamic prompt guidance from current records without content", () => {
    const store = new ArtifactStore()
    store.create(JSON.parse(createCommand("one", "create-one", "private content")))
    const spec = artifactPromptSpec(store)
    expect(spec).toContain("one")
    expect(spec).toContain("revision 0")
    expect(spec).not.toContain("private content")
    const plugin = artifact({ store })
    expect(typeof plugin.promptSpec).toBe("function")
  })
})
