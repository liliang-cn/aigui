// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"

const mocks = vi.hoisted(() => ({
  addModel: vi.fn(),
  addStyle: vi.fn(),
  clear: vi.fn(),
  createViewer: vi.fn(),
  getCanvas: vi.fn(),
  loseContext: vi.fn(),
  removeAllLabels: vi.fn(),
  removeAllModels: vi.fn(),
  removeAllShapes: vi.fn(),
  render: vi.fn(),
  resize: vi.fn(),
  setStyle: vi.fn(),
  zoomTo: vi.fn(),
}))

let releaseImport: (() => void) | undefined
let delayImport = false

vi.mock("3dmol", async () => {
  if (delayImport) await new Promise<void>((resolve) => { releaseImport = resolve })
  return { createViewer: mocks.createViewer }
})

const spatialMolfile = `ethanol
  AIGUI

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.7500 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END`
const definition = { version: 1, format: "molfile", source: spatialMolfile, view: "3d", style: "space-filling", highlight: { atoms: [1], bonds: [0] } }

function viewer() {
  return {
    addModel: mocks.addModel,
    addStyle: mocks.addStyle,
    clear: mocks.clear,
    getCanvas: mocks.getCanvas,
    removeAllLabels: mocks.removeAllLabels,
    removeAllModels: mocks.removeAllModels,
    removeAllShapes: mocks.removeAllShapes,
    render: mocks.render,
    resize: mocks.resize,
    setStyle: mocks.setStyle,
    zoomTo: mocks.zoomTo,
  }
}

describe("molecule 3D lifecycle", () => {
  beforeEach(() => {
    vi.resetModules()
    delayImport = false
    releaseImport = undefined
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.createViewer.mockImplementation(() => viewer())
    mocks.getCanvas.mockReturnValue({ getContext: () => ({ getExtension: () => ({ loseContext: mocks.loseContext }) }) })
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn()
      disconnect = vi.fn()
    })
  })

  it("loads 3dmol only inside mount and uses only local validated Molfile", async () => {
    const { molecule } = await import("./index")
    const render = collectNodeRenderers([molecule()]).molecule
    const out = await render({ key: "m:3d", type: "molecule", content: JSON.stringify(definition), complete: true } as ASTNode) as RenderOutput
    expect(mocks.createViewer).not.toHaveBeenCalled()
    expect(out.kind).toBe("mount")
    if (out.kind !== "mount") return
    const host = document.createElement("div")
    out.mount(host)
    await vi.waitFor(() => expect(mocks.createViewer).toHaveBeenCalledOnce())
    expect(mocks.addModel).toHaveBeenCalledWith(spatialMolfile, "mol")
    expect(mocks.setStyle).toHaveBeenCalled()
    expect(mocks.zoomTo).toHaveBeenCalled()
    expect(mocks.render).toHaveBeenCalled()
  })

  it("provides a Reset control that restores zoom and rendering", async () => {
    const { molecule } = await import("./index")
    const render = collectNodeRenderers([molecule()]).molecule
    const out = await render({ key: "m:reset", type: "molecule", content: JSON.stringify(definition), complete: true } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    await vi.waitFor(() => expect(mocks.createViewer).toHaveBeenCalledOnce())
    mocks.zoomTo.mockClear(); mocks.render.mockClear()
    const button = host.querySelector("button")
    expect(button?.textContent).toBe("Reset")
    button?.click()
    expect(mocks.zoomTo).toHaveBeenCalledOnce()
    expect(mocks.render).toHaveBeenCalledOnce()
  })

  it("cleans up idempotently and releases WebGL", async () => {
    const disconnect = vi.fn()
    vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = disconnect })
    const { molecule } = await import("./index")
    const render = collectNodeRenderers([molecule()]).molecule
    const out = await render({ key: "m:cleanup", type: "molecule", content: JSON.stringify(definition), complete: true } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    const cleanup = out.mount(host)
    await vi.waitFor(() => expect(mocks.createViewer).toHaveBeenCalledOnce())
    if (typeof cleanup !== "function") throw new Error("expected cleanup")
    cleanup(); cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(mocks.removeAllModels).toHaveBeenCalledOnce()
    expect(mocks.removeAllShapes).toHaveBeenCalledOnce()
    expect(mocks.removeAllLabels).toHaveBeenCalledOnce()
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(mocks.loseContext).toHaveBeenCalledOnce()
    expect(host.childNodes).toHaveLength(0)
  })

  it("does not let a lazy import revive an already disposed mount", async () => {
    delayImport = true
    const { molecule } = await import("./index")
    const render = collectNodeRenderers([molecule()]).molecule
    const out = await render({ key: "m:race", type: "molecule", content: JSON.stringify(definition), complete: true } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    const cleanup = out.mount(host)
    if (typeof cleanup !== "function") throw new Error("expected cleanup")
    cleanup()
    releaseImport?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.createViewer).not.toHaveBeenCalled()
    expect(host.childNodes).toHaveLength(0)
  })

  it("turns import/viewer failures into a generic mount error without leaking details", async () => {
    mocks.createViewer.mockImplementation(() => { throw new Error("WEBGL SECRET") })
    const { molecule } = await import("./index")
    const render = collectNodeRenderers([molecule()]).molecule
    const out = await render({ key: "m:error", type: "molecule", content: JSON.stringify(definition), complete: true } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")
    const host = document.createElement("div")
    out.mount(host)
    await vi.waitFor(() => expect(host.querySelector("[data-aigui-molecule-error]")).toBeTruthy())
    expect(host.textContent).not.toContain("SECRET")
  })
})
