// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { graph, graphPromptSpec } from "./index"

vi.mock("./render3d", () => ({
  mount3d: vi.fn(async (host: HTMLElement) => {
    const canvas = document.createElement("canvas")
    canvas.setAttribute("data-fake-three", "")
    host.appendChild(canvas)
    return { destroy: () => canvas.remove() }
  }),
}))

const renderNode = (content: string, complete = true, options?: Parameters<typeof graph>[0], theme?: string): Promise<RenderOutput> =>
  Promise.resolve(collectNodeRenderers([graph(options)]).graph({ key: "0:0", type: "graph", content, complete } as ASTNode, { theme, locale: "zh-CN" }) as RenderOutput)

const COMPANY = JSON.stringify({
  classes: [{ id: "Person", name: "人" }, { id: "Organization", name: "组织" }],
  properties: [{ id: "worksAt", name: "任职于", domain: "Person", range: "Organization" }],
  entities: [{ id: "alice", name: "Alice", type: "Person" }, { id: "bob", name: "Bob", type: "Person" }, { id: "acme", name: "Acme", type: "Organization" }],
  relations: [{ from: "alice", to: "acme", type: "worksAt" }, { from: "alice", to: "bob", type: "worksAt" }],
  caption: "who works where",
})
const PLAIN = JSON.stringify({ entities: [{ id: "a" }, { id: "b" }], relations: [{ from: "a", to: "b" }] })

const mounted = async (content: string, options?: Parameters<typeof graph>[0]) => {
  const output = await renderNode(content, true, options)
  if (output.kind !== "mount") throw new Error(`expected mount, got ${output.kind}`)
  const el = document.createElement("div")
  document.body.appendChild(el)
  const dispose = output.mount(el, {}) ?? (() => {})
  return { el, dispose }
}

describe("the graph plugin", () => {
  it("claims the graph fence", () => {
    expect(Object.keys(collectNodeRenderers([graph()]))).toEqual(["graph"])
  })
  it("shows a skeleton while the fence is still streaming", async () => {
    const output = await renderNode('{"entities":[', false)
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("data-aigui-graph-loading")
  })
  it("says why a graph could not be drawn, with the model's text escaped", async () => {
    const output = await renderNode(JSON.stringify({ entities: [{ id: "a", "<img src=x onerror=alert(1)>": 1 }] }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-graph-error")
      expect(output.html).toContain("is not a field")
      expect(output.html).not.toContain("<img")
      expect(output.trusted).toBe(true)
    }
  })
  it("renders a static figure when the host turns interaction off", async () => {
    const output = await renderNode(COMPANY, true, { interactive: false })
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("<svg")
      expect(output.html).toContain("data-graph-node=\"alice\"")
      expect(output.html).toContain("data-aigui-graph-violations")
      expect(output.html).toContain("Alice —任职于→ Bob")
      expect(output.html).toContain("who works where")
      expect(output.html).not.toContain("data-aigui-graph-toolbar")
    }
  })
  it("mounts an interactive figure with the two toggles and the violation list", async () => {
    const { el, dispose } = await mounted(COMPANY)
    expect(el.querySelector("svg[data-graph-layer='instances']")).not.toBeNull()
    const toolbar = el.querySelector("[data-aigui-graph-toolbar]")!
    expect(toolbar.querySelector("[data-graph-view='3d']")).not.toBeNull()
    expect(toolbar.querySelector("[data-graph-layer-toggle='ontology']")).not.toBeNull()
    expect(toolbar.textContent).toContain("本体")
    const violations = el.querySelector("[data-aigui-graph-violations]")!
    expect(violations.textContent).toContain("Alice —任职于→ Bob")
    expect(violations.textContent).toContain("组织")
    expect(el.querySelector("[data-aigui-graph-caption]")!.textContent).toBe("who works where")
    dispose()
    dispose()
    expect(el.querySelector("svg")).toBeNull()
  })
  it("flips to the ontology layer and back", async () => {
    const { el, dispose } = await mounted(COMPANY)
    ;(el.querySelector("[data-graph-layer-toggle='ontology']") as HTMLButtonElement).click()
    expect(el.querySelector("svg[data-graph-layer='ontology']")).not.toBeNull()
    expect(el.querySelectorAll("[data-graph-class]")).toHaveLength(2)
    expect(el.querySelector("[data-graph-layer-toggle='ontology']")!.getAttribute("aria-pressed")).toBe("true")
    ;(el.querySelector("[data-graph-layer-toggle='instances']") as HTMLButtonElement).click()
    expect(el.querySelector("svg[data-graph-layer='instances']")).not.toBeNull()
    dispose()
  })
  it("flips to 3D through the lazily loaded renderer", async () => {
    const { mount3d } = await import("./render3d")
    const { el, dispose } = await mounted(COMPANY)
    ;(el.querySelector("[data-graph-view='3d']") as HTMLButtonElement).click()
    await vi.waitFor(() => expect(el.querySelector("[data-fake-three]")).not.toBeNull())
    expect(mount3d).toHaveBeenCalled()
    expect(el.querySelector("svg[data-graph-layer]")).toBeNull()
    ;(el.querySelector("[data-graph-view='2d']") as HTMLButtonElement).click()
    expect(el.querySelector("[data-fake-three]")).toBeNull()
    expect(el.querySelector("svg[data-graph-layer='instances']")).not.toBeNull()
    dispose()
  })
  it("opens in 3D when the block asks for it", async () => {
    const { el, dispose } = await mounted(COMPANY.replace('"caption"', '"view":"3d","caption"'))
    await vi.waitFor(() => expect(el.querySelector("[data-fake-three]")).not.toBeNull())
    dispose()
    expect(el.querySelector("[data-fake-three]")).toBeNull()
  })
  it("hides the ontology toggle when there is no ontology, and the 3D toggle when the host says so", async () => {
    const plain = await mounted(PLAIN, { three: false })
    expect(plain.el.querySelector("[data-graph-layer-toggle]")).toBeNull()
    expect(plain.el.querySelector("[data-graph-view='3d']")).toBeNull()
    expect(plain.el.querySelector("[data-aigui-graph-violations]")).toBeNull()
    plain.dispose()
  })
  it("falls back to 2D with a note when 3D is asked for but switched off", async () => {
    const { el, dispose } = await mounted(COMPANY.replace('"caption"', '"view":"3d","caption"'), { three: false })
    expect(el.querySelector("svg[data-graph-layer='instances']")).not.toBeNull()
    dispose()
  })
  it("passes entity clicks through", async () => {
    const onEntityClick = vi.fn()
    const { el, dispose } = await mounted(COMPANY, { onEntityClick })
    const alice = el.querySelector("[data-graph-item='alice']")!
    alice.dispatchEvent(new Event("click", { bubbles: true }))
    expect(onEntityClick).toHaveBeenCalledWith(expect.objectContaining({ id: "alice" }))
    dispose()
  })
})

describe("isBlockComplete", () => {
  const complete = graph().isBlockComplete!
  it("waits for the whole JSON object", () => {
    expect(complete("graph", '{"entities":[{"id":"a"')).toBe(false)
    expect(complete("graph", '{"entities":[{"id":"a"}]}')).toBe(true)
    expect(complete("graph", "[]")).toBe(false)
  })
})

describe("graphPromptSpec", () => {
  it("carries the rules the checks depend on", () => {
    const zh = graphPromptSpec("zh-CN")
    expect(zh).toContain("domain")
    expect(zh).toContain("range")
    expect(zh).toContain("subClassOf")
    expect(zh).toContain('"view": "3d"')
    expect(zh.split("```graph\n")).toHaveLength(3)
    const en = graphPromptSpec("en")
    expect(en).toContain("domain")
    expect(en).toContain("mermaid")
  })
  it("is collected by buildSystemPrompt", () => {
    expect(buildSystemPrompt({ base: "x", plugins: [graph()], locale: "zh-CN" })).toContain("```graph")
  })
})
