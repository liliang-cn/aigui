// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, createParser, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { parseProgress, progress, progressPromptSpec, renderProgressHTML } from "./index"

function nodesFor(...blocks: unknown[]) {
  const plugin = progress()
  const text = blocks.map((block) => `\`\`\`progress\n${JSON.stringify(block)}\n\`\`\``).join("\n\n")
  const nodes = createParser({ plugins: [plugin] })(text)
  const render = collectNodeRenderers([plugin]).progress
  // The commit hook is what decides which block owns which step; the host calls it before rendering.
  plugin.onASTCommit?.(nodes, { generation: 1 } as never)
  const html = nodes
    .filter((node) => node.type === "progress")
    .map((node) => {
      const out = render(node) as RenderOutput
      if (out.kind !== "html") throw new Error("expected html")
      return out.html
    })
  return { html, joined: html.join("") }
}

describe("plugin-progress", () => {
  it("draws the steps of a turn, with their states", () => {
    const { joined } = nodesFor({
      version: 1,
      steps: [
        { id: "search", label: "检索资料", state: "done" },
        { id: "read", label: "阅读来源", state: "running", detail: "第 2/5 篇", percent: 40 },
        { id: "draft", label: "撰写讲解", state: "pending" },
      ],
    })

    expect(joined).toContain('data-aigui-progress="steps"')
    expect(joined.match(/data-aigui-progress-step=/g)).toHaveLength(3)
    expect(joined).toContain('data-aigui-progress-step="done"')
    expect(joined).toContain('data-aigui-progress-step="running"')
    expect(joined).toContain("第 2/5 篇")
    expect(joined).toContain('aria-valuenow="40"')
  })

  it("updates a step in place when it is emitted again", () => {
    // The whole point. A streamed answer is append-only, so an update *is* a second block; rendering
    // both would give a turn that restated four steps three times twelve rows of nonsense.
    const { html, joined } = nodesFor(
      { version: 1, id: "search", label: "检索资料", state: "running" },
      { version: 1, id: "search", label: "检索资料", state: "done", detail: "找到 8 条" },
    )

    expect(html[0]).toBe("")
    expect(joined.match(/data-aigui-progress-step=/g)).toHaveLength(1)
    expect(joined).toContain('data-aigui-progress-step="done"')
    expect(joined).toContain("找到 8 条")
    expect(joined).not.toContain('data-aigui-progress-step="running"')
  })

  it("keeps several progresses in one request apart", () => {
    // "One request, several progresses": two ids advance independently, and updating one leaves the
    // other where it was.
    const { joined } = nodesFor(
      { version: 1, steps: [{ id: "a", label: "取教材", state: "running" }, { id: "b", label: "查时政", state: "running" }] },
      { version: 1, id: "a", label: "取教材", state: "done" },
    )

    expect(joined.match(/data-aigui-progress-step=/g)).toHaveLength(2)
    expect(joined).toContain("取教材")
    expect(joined).toContain("查时政")
    expect(joined).toContain('data-aigui-progress-step="done"')
    expect(joined).toContain('data-aigui-progress-step="running"')
  })

  it("restating the whole list does not duplicate the rows", () => {
    const steps = [
      { id: "a", label: "一", state: "done" },
      { id: "b", label: "二", state: "running" },
    ]
    const { joined } = nodesFor({ version: 1, steps }, { version: 1, steps })

    expect(joined.match(/data-aigui-progress-step=/g)).toHaveLength(2)
  })

  it("accepts one step or a list, because a model writes both", () => {
    expect(parseProgress(JSON.stringify({ version: 1, id: "a", label: "一" }))).toMatchObject({
      valid: true,
      steps: [{ id: "a", label: "一", state: "running" }],
    })
    expect(parseProgress(JSON.stringify({ version: 1, steps: [{ id: "a", label: "一" }] }))).toMatchObject({
      valid: true,
    })
  })

  it("clamps a percentage rather than drawing outside the bar", () => {
    const parsed = parseProgress(JSON.stringify({ version: 1, id: "a", label: "一", percent: 240 }))
    expect(parsed.valid && parsed.steps[0].percent).toBe(100)
    const low = parseProgress(JSON.stringify({ version: 1, id: "a", label: "一", percent: -5 }))
    expect(low.valid && low.steps[0].percent).toBe(0)
  })

  it("refuses a block that is not progress", () => {
    for (const [source, reason] of [
      ["not json", "valid JSON"],
      ["[]", "JSON object"],
      ['{"id":"a","label":"一"}', '"version": 1'],
      ['{"version":1,"steps":[]}', "at least one step"],
      ['{"version":1,"label":"一"}', "id must be a non-empty string"],
      ['{"version":1,"id":"a"}', "label must be a non-empty string"],
      ['{"version":1,"id":"a","label":"一","state":"almost"}', "state must be one of"],
    ] as const) {
      const parsed = parseProgress(source)
      expect(parsed.valid, source).toBe(false)
      if (!parsed.valid) expect(parsed.issues.join(" "), source).toContain(reason)
    }
  })

  it("escapes a label rather than letting it become markup", () => {
    const html = renderProgressHTML([{ id: "a", label: "<script>alert(1)</script>", state: "done" }])

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("shows a placeholder while the block is still arriving", () => {
    const plugin = progress()
    const render = collectNodeRenderers([plugin]).progress
    const out = render({ key: "0:a", type: "progress", content: '{"version":1,', complete: false } as ASTNode) as RenderOutput

    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-block-loading")
  })

  it("tells the model how to update a step and when not to use this at all", () => {
    const spec = progressPromptSpec()

    expect(spec).toContain("```progress")
    expect(spec).toContain("same id")
    // A model told only "you may report progress" narrates its prose with it.
    expect(spec).toContain("Do not narrate ordinary prose")
  })
  it("survives a re-parse, where every node is a new object", () => {
    // A streaming host re-parses the turn as it grows, and the node carrying a block is a new object
    // every time — same key, different identity. Ownership is tracked by identity, so this is the case
    // that would have made progress vanish mid-turn with every block still on the page.
    const plugin = progress()
    const parse = createParser({ plugins: [plugin] })
    const render = collectNodeRenderers([plugin]).progress
    const text = '```progress\n{"version":1,"id":"a","label":"检索","state":"running"}\n```'

    const first = parse(text)
    plugin.onASTCommit?.(first, { generation: 1 } as never)
    const second = parse(text)
    plugin.onASTCommit?.(second, { generation: 2 } as never)

    const node = second.find((item) => item.type === "progress")!
    const out = render(node) as RenderOutput
    if (out.kind !== "html") throw new Error("expected html")
    expect(out.html).toContain("检索")
    // The premise of the test, stated so it cannot silently stop being true.
    expect(node).not.toBe(first.find((item) => item.type === "progress"))
  })
})
