// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"
import {
  molecule,
  moleculeCss,
  moleculePromptSpec,
  parseMoleculeDefinition,
  validateMoleculeDefinition,
} from "./index"

const flatMolfile = `ethanol
  AIGUI

  3  2  0  0  0  0            999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END`

const spatialMolfile = flatMolfile.replace("    1.2990    0.0000 O", "    1.2990    0.7500 O")
const smiles2d = { version: 1, format: "smiles", source: "CCO", view: "2d" } as const
const molfile2d = { version: 1, format: "molfile", source: flatMolfile, view: "2d" } as const
const molfile3d = { version: 1, format: "molfile", source: spatialMolfile, view: "3d", style: "ball-and-stick" } as const

describe("molecule protocol", () => {
  it("accepts the exact v1 SMILES and Molfile forms", async () => {
    expect((await validateMoleculeDefinition(smiles2d)).ok).toBe(true)
    expect((await validateMoleculeDefinition(molfile2d)).ok).toBe(true)
    expect((await validateMoleculeDefinition(molfile3d)).ok).toBe(true)
  })

  it("parses strict JSON and rejects trailing tokens", async () => {
    expect((await parseMoleculeDefinition(JSON.stringify(smiles2d))).ok).toBe(true)
    expect((await parseMoleculeDefinition(`${JSON.stringify(smiles2d)} trailing`)).ok).toBe(false)
  })

  it.each([
    {},
    { ...smiles2d, version: 2 },
    { ...smiles2d, format: "pdb" },
    { ...smiles2d, style: "ball-and-stick" },
    { ...molfile3d, style: "cartoon" },
    { ...smiles2d, atomLabels: "none" },
    { ...smiles2d, extra: true },
    { ...smiles2d, __proto__: { polluted: true } },
    { ...smiles2d, highlight: { atoms: [0, 0] } },
    { ...smiles2d, highlight: { atoms: [-1] } },
    { ...smiles2d, highlight: { atoms: [Number.MAX_SAFE_INTEGER + 1] } },
    { ...smiles2d, highlight: { bonds: [0, 0] } },
    { ...smiles2d, highlight: { atoms: [0], extra: [] } },
  ])("rejects invalid schema %#", async (value) => {
    expect((await validateMoleculeDefinition(value)).ok).toBe(false)
  })

  it("rejects class instances, cycles, sparse arrays, and nonfinite values", async () => {
    class Definition { version = 1; format = "smiles"; source = "CC"; view = "2d" }
    const cyclic: Record<string, unknown> = { ...smiles2d }; cyclic.self = cyclic
    const sparse = new Array(2); sparse[0] = 0
    expect((await validateMoleculeDefinition(new Definition())).ok).toBe(false)
    expect((await validateMoleculeDefinition(cyclic)).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...smiles2d, highlight: { atoms: sparse } })).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...smiles2d, highlight: { atoms: [Number.POSITIVE_INFINITY] } })).ok).toBe(false)
  })

  it("enforces configurable source and chemistry limits", async () => {
    expect((await validateMoleculeDefinition(smiles2d, { maxSourceBytes: 2 })).ok).toBe(false)
    expect((await validateMoleculeDefinition(smiles2d, { maxAtoms: 2 })).ok).toBe(false)
    expect((await validateMoleculeDefinition(smiles2d, { maxBonds: 1 })).ok).toBe(false)
    expect(() => molecule({ maxSourceBytes: 256 * 1024 + 1 })).toThrow()
    expect(() => molecule({ maxAtoms: 1025 })).toThrow()
    expect(() => molecule({ maxBonds: 2049 })).toThrow()
  })

  it("validates all option fields and defaults", () => {
    expect(() => molecule({ width: 159 })).toThrow()
    expect(() => molecule({ width: 1201 })).toThrow()
    expect(() => molecule({ height: 159 })).toThrow()
    expect(() => molecule({ height: 901 })).toThrow()
    expect(() => molecule({ enable3D: 1 as never })).toThrow()
    expect(() => molecule({ unknown: true } as never)).toThrow()
    expect(() => moleculePromptSpec({ unknown: true } as never)).toThrow()
  })

  it("rejects malformed chemistry, out-of-range highlights, and flat 3D", async () => {
    expect((await validateMoleculeDefinition({ ...smiles2d, source: "C1(" })).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...molfile2d, source: "not a molfile" })).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...smiles2d, highlight: { atoms: [3] } })).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...smiles2d, highlight: { bonds: [2] } })).ok).toBe(false)
    expect((await validateMoleculeDefinition({ ...molfile3d, source: flatMolfile })).ok).toBe(false)
    expect((await validateMoleculeDefinition(molfile3d, { enable3D: false })).ok).toBe(false)
  })

  describe("3D from SMILES", () => {
    const smiles3d = { ...smiles2d, view: "3d" } as const

    it("accepts a SMILES structure in 3D by generating its coordinates", async () => {
      // This is the whole point: a model writes SMILES, not Molfiles with z coordinates.
      expect((await validateMoleculeDefinition(smiles3d)).ok).toBe(true)
      expect((await validateMoleculeDefinition({ ...smiles3d, style: "space-filling" })).ok).toBe(true)
    })
    it("accepts a planar molecule, whose generated conformer is legitimately flat", async () => {
      // The flatness check exists to catch a 2D drawing passed off as 3D; a generated benzene is
      // flat because benzene is.
      expect((await validateMoleculeDefinition({ ...smiles3d, source: "c1ccccc1" })).ok).toBe(true)
    })
    it("still honours enable3D and the highlight bounds of the SMILES as written", async () => {
      expect((await validateMoleculeDefinition(smiles3d, { enable3D: false })).ok).toBe(false)
      // Hydrogens are added for the conformer, but the model indexed the heavy atoms it wrote.
      expect((await validateMoleculeDefinition({ ...smiles3d, highlight: { atoms: [2] } })).ok).toBe(true)
      expect((await validateMoleculeDefinition({ ...smiles3d, highlight: { atoms: [3] } })).ok).toBe(false)
    })
    it("refuses structures above maxConformerAtoms rather than stalling the page", async () => {
      expect((await validateMoleculeDefinition({ ...smiles3d, source: "CC(=O)Oc1ccccc1C(=O)O" }, { maxConformerAtoms: 12 })).ok).toBe(false)
      expect((await validateMoleculeDefinition({ ...smiles3d, source: "CC(=O)Oc1ccccc1C(=O)O" }, { maxConformerAtoms: 13 })).ok).toBe(true)
      expect(() => molecule({ maxConformerAtoms: 0 })).toThrow()
      expect(() => molecule({ maxConformerAtoms: 1025 })).toThrow()
    })
    it("tells the model to write SMILES for 3D rather than a Molfile from memory", () => {
      const prompt = moleculePromptSpec({ maxConformerAtoms: 40 })
      expect(prompt).toContain("SMILES supports 2d and 3d")
      expect(prompt).toContain("40 heavy atoms")
      expect(prompt).toMatch(/Never write a Molfile from memory/)
    })
  })

  it("does not expose chemistry parser errors", async () => {
    const result = await validateMoleculeDefinition({ ...smiles2d, source: "C1(" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(JSON.stringify(result.error)).not.toMatch(/ring|smiles|parser|exception/i)
  })
})

describe("molecule plugin", () => {
  it("claims exactly one complete-gated molecule fence", async () => {
    const plugin = molecule()
    expect(plugin.name).toBe("molecule")
    expect(Object.keys(plugin.nodeRenderers)).toEqual(["molecule"])
    const render = collectNodeRenderers([plugin]).molecule
    const out = await render({ key: "m:stream", type: "molecule", content: "{", complete: false } as ASTNode) as RenderOutput
    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-molecule-loading")
  })

  it("caches output by AST node identity", () => {
    const render = collectNodeRenderers([molecule()]).molecule
    const node = { key: "m:cache", type: "molecule", content: JSON.stringify(smiles2d), complete: true } as ASTNode
    expect(render(node)).toBe(render(node))
  })

  it("returns one generic non-reflective error for JSON, schema, chemistry, and render failures", async () => {
    const render = collectNodeRenderers([molecule()]).molecule
    for (const content of ["not json SECRET", JSON.stringify({ ...smiles2d, secret: "SECRET" }), JSON.stringify({ ...smiles2d, source: "SECRET(" })]) {
      const out = await render({ key: content, type: "molecule", content, complete: true } as ASTNode) as RenderOutput
      expect(out.kind).toBe("html")
      if (out.kind === "html") {
        expect(out.html).toContain("data-aigui-molecule-error")
        expect(out.html).not.toContain("SECRET")
      }
    }
  })

  it("renders 2D via a safe responsive mount with inert SVG", async () => {
    const render = collectNodeRenderers([molecule({ width: 640, height: 360 })]).molecule
    const out = await render({ key: "m:2d", type: "molecule", content: JSON.stringify({ ...smiles2d, highlight: { atoms: [0], bonds: [0] }, atomLabels: "all" }), complete: true } as ASTNode) as RenderOutput
    expect(out.kind).toBe("mount")
    if (out.kind !== "mount") return
    const host = document.createElement("div")
    const cleanup = out.mount(host)
    const svg = host.querySelector("svg")
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute("width")).toBe("100%")
    expect(svg?.getAttribute("style") ?? "").toContain("max-width")
    expect(host.querySelector("script,foreignObject")).toBeNull()
    expect(host.innerHTML).not.toMatch(/\son\w+=|(?:href|src)\s*=|javascript:/i)
    expect(typeof cleanup).toBe("function")
    if (typeof cleanup === "function") cleanup()
    expect(host.childNodes).toHaveLength(0)
  })

  it("documents the exact local-only protocol", () => {
    const prompt = moleculePromptSpec()
    expect(prompt).toContain("```molecule")
    expect(prompt).toContain('"version":1')
    expect(prompt).toContain("SMILES")
    expect(prompt).toContain("Molfile")
    expect(prompt).toContain("2d")
    expect(prompt).toContain("3d")
    expect(prompt).toMatch(/no URLs|Never emit URLs/i)
    expect(prompt).toMatch(/scripts/i)
    expect(prompt).toMatch(/network|remote resources/i)
    expect(molecule().promptSpec).toBe(prompt)
    expect(moleculeCss).toContain("data-aigui-molecule")
  })
})

export { flatMolfile, spatialMolfile, molfile3d }
