import { describe, expect, it } from "vitest"
import { buildSystemPrompt, collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import { scene, scenePromptSpec } from "./index"

const renderNode = (content: string, complete = true, options?: Parameters<typeof scene>[0]): Promise<RenderOutput> =>
  collectNodeRenderers([scene(options)]).scene({ key: "0:0", type: "scene", content, complete } as ASTNode) as Promise<RenderOutput>

const TABLE = JSON.stringify({
  objects: [
    { shape: "cylinder", radius: 0.04, height: 0.72, position: [-0.6, 0, -0.35], anchor: "bottom" },
    { shape: "box", size: [1.4, 0.04, 0.8], position: [0, 0.72, 0], anchor: "bottom", label: "top" },
  ],
  caption: "a table",
})

describe("the scene plugin", () => {
  it("claims the scene fence", () => {
    expect(Object.keys(collectNodeRenderers([scene()]))).toEqual(["scene"])
  })
  it("mounts a scene for a valid definition", async () => {
    expect((await renderNode(TABLE)).kind).toBe("mount")
  })
  it("shows a skeleton while the fence is still streaming", async () => {
    const output = await renderNode('{"objects":[', false)
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).toContain("data-aigui-scene-loading")
  })
  it("says why a scene could not be built rather than showing a blank box", async () => {
    const output = await renderNode(JSON.stringify({ objects: [{ shape: "box" }] }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") {
      expect(output.html).toContain("data-aigui-scene-error")
      expect(output.html).toContain("box needs size")
      expect(output.trusted).toBe(true)
    }
  })
  it("never lets the model's own text through in an error", async () => {
    const output = await renderNode(JSON.stringify({ objects: [{ shape: "box", size: [1, 1, 1], "<img src=x onerror=alert(1)>": 1 }] }))
    expect(output.kind).toBe("html")
    if (output.kind === "html") expect(output.html).not.toContain("<img")
  })
  it("refuses a lone model file unless the host opened its origin", async () => {
    const fence = JSON.stringify({ objects: [{ shape: "model", src: "https://cdn.example.com/x.glb" }] })
    const closed = await renderNode(fence)
    expect(closed.kind).toBe("html")
    if (closed.kind === "html") expect(closed.html).toContain("disabled")
    const open = await renderNode(fence, true, { allowedModelOrigins: ["https://cdn.example.com"] })
    expect(open.kind).toBe("mount")
  })
  it("still mounts the rest of a scene whose model file was refused", async () => {
    const fence = JSON.stringify({ objects: [{ shape: "box", size: [1, 1, 1] }, { shape: "model", src: "https://cdn.example.com/x.glb" }] })
    expect((await renderNode(fence)).kind).toBe("mount")
  })
})

describe("isBlockComplete", () => {
  const complete = scene().isBlockComplete!
  it("waits for the whole JSON object", () => {
    expect(complete("scene", '{"objects":[{"shape":"box"')).toBe(false)
    expect(complete("scene", '{"objects":[{"shape":"box","size":[1,1,1]}]}')).toBe(true)
  })
})

describe("scenePromptSpec", () => {
  it("carries the rules the arithmetic depends on", () => {
    const spec = scenePromptSpec("zh-CN")
    expect(spec).toContain('"anchor": "bottom"')
    expect(spec).toContain("y 轴向上")
    expect(spec).toContain("不要自己编一个地址")
  })
  it("shows the anchor habit in every worked example, because that is what a model copies", () => {
    const spec = scenePromptSpec("zh-CN")
    const examples = spec.split("```scene\n").slice(1)
    expect(examples).toHaveLength(2)
    for (const example of examples) expect(example).toContain('"anchor": "bottom"')
  })
  it("sends solid-geometry questions to the solid block instead", () => {
    expect(scenePromptSpec("zh-CN")).toContain("用 solid 块")
    expect(scenePromptSpec("en")).toContain("use a solid block")
  })
  it("falls back to English for a locale it does not ship", () => {
    expect(scenePromptSpec("de")).toContain("Units are metres")
  })
  it("is what the plugin hands buildSystemPrompt", () => {
    const prompt = buildSystemPrompt({ base: "You are a designer.", plugins: [scene()], locale: "en" })
    expect(prompt).toContain("You are a designer.")
    expect(prompt).toContain("3D scenes (fenced)")
  })
})
