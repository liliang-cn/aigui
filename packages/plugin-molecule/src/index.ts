import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"

export type MoleculeFormat = "smiles" | "molfile"
export type MoleculeView = "2d" | "3d"
export type MoleculeStyle = "ball-and-stick" | "space-filling"
export type MoleculeAtomLabels = "standard" | "all"

export interface MoleculeHighlight {
  atoms?: number[]
  bonds?: number[]
}

export interface Molecule2DDefinition {
  version: 1
  format: MoleculeFormat
  source: string
  view: "2d"
  atomLabels?: MoleculeAtomLabels
  highlight?: MoleculeHighlight
}

export interface Molecule3DDefinition {
  version: 1
  format: "molfile"
  source: string
  view: "3d"
  style?: MoleculeStyle
  atomLabels?: MoleculeAtomLabels
  highlight?: MoleculeHighlight
}

export type MoleculeDefinition = Molecule2DDefinition | Molecule3DDefinition

export interface MoleculeOptions {
  width?: number
  height?: number
  enable3D?: boolean
  maxAtoms?: number
  maxBonds?: number
  maxSourceBytes?: number
}

export type MoleculeErrorCode = "invalid-definition" | "invalid-options"

export interface MoleculeError {
  code: MoleculeErrorCode
  message: string
}

export type MoleculeResult<T = MoleculeDefinition> =
  | { ok: true; value: T }
  | { ok: false; error: MoleculeError }

interface ResolvedOptions {
  width: number
  height: number
  enable3D: boolean
  maxAtoms: number
  maxBonds: number
  maxSourceBytes: number
}

interface ParsedChemistry {
  definition: MoleculeDefinition
  molecule: OclMolecule
  atomCount: number
  bondCount: number
}

interface OclMolecule {
  getAllAtoms(): number
  getAllBonds(): number
  getAtomX(atom: number): number
  getAtomY(atom: number): number
  getAtomZ(atom: number): number
  getBondAtom(side: number, bond: number): number
  setAtomSelection(atom: number, selected: boolean): void
  toSVG(width: number, height: number, id?: string, options?: Record<string, unknown>): string
}

interface OclModule {
  Molecule: {
    fromSmiles(source: string): OclMolecule
    fromMolfile(source: string): OclMolecule
  }
}

const DEFAULTS: ResolvedOptions = {
  width: 600,
  height: 400,
  enable3D: true,
  maxAtoms: 256,
  maxBonds: 512,
  maxSourceBytes: 64 * 1024,
}

const MAX_SOURCE_BYTES = 256 * 1024
const MAX_ATOMS = 1024
const MAX_BONDS = 2048
const DEFINITION_KEYS = new Set(["version", "format", "source", "view", "style", "atomLabels", "highlight"])
const HIGHLIGHT_KEYS = new Set(["atoms", "bonds"])
const OPTION_KEYS = new Set(["width", "height", "enable3D", "maxAtoms", "maxBonds", "maxSourceBytes"])
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"])
const encoder = new TextEncoder()
let oclPromise: Promise<OclModule> | null = null

const loadOpenChemLib = () => (oclPromise ??= import("openchemlib") as Promise<unknown> as Promise<OclModule>)

function invalid<T = MoleculeDefinition>(): MoleculeResult<T> {
  return { ok: false, error: { code: "invalid-definition", message: "Molecule definition is invalid." } }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isDenseUniqueIndexes(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<number>()
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) return false
    const item = value[index]
    if (!Number.isSafeInteger(item) || item < 0 || seen.has(item)) return false
    seen.add(item)
  }
  return true
}

function isStructurallySafe(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  if (value === null || ["string", "boolean"].includes(typeof value)) return true
  if (typeof value !== "object") return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value) || !isStructurallySafe(value[i], seen)) return false
    }
    seen.delete(value)
    return true
  }
  if (!isPlainObject(value)) return false
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key) || !isStructurallySafe(value[key], seen)) return false
  }
  seen.delete(value)
  return true
}

function resolveOptions(options: MoleculeOptions = {}): ResolvedOptions {
  if (!isPlainObject(options)) throw new TypeError("Molecule options must be a plain object")
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key) || DANGEROUS_KEYS.has(key)) throw new TypeError("Unknown molecule option")
  }
  const resolved = { ...DEFAULTS, ...options }
  const boundedInteger = (name: keyof ResolvedOptions, min: number, max: number) => {
    const value = resolved[name]
    if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
      throw new TypeError(`${name} is out of range`)
    }
  }
  boundedInteger("width", 160, 1200)
  boundedInteger("height", 160, 900)
  boundedInteger("maxAtoms", 1, MAX_ATOMS)
  boundedInteger("maxBonds", 0, MAX_BONDS)
  boundedInteger("maxSourceBytes", 1, MAX_SOURCE_BYTES)
  if (typeof resolved.enable3D !== "boolean") throw new TypeError("enable3D must be boolean")
  return resolved
}

function validateShape(value: unknown, options: ResolvedOptions): MoleculeDefinition | null {
  if (!isStructurallySafe(value) || !isPlainObject(value)) return null
  const keys = Object.keys(value)
  if (keys.some((key) => !DEFINITION_KEYS.has(key) || DANGEROUS_KEYS.has(key))) return null
  if (value.version !== 1 || (value.format !== "smiles" && value.format !== "molfile")) return null
  if (typeof value.source !== "string" || encoder.encode(value.source).byteLength > options.maxSourceBytes) return null
  if (value.view !== "2d" && value.view !== "3d") return null
  if (value.atomLabels !== undefined && value.atomLabels !== "standard" && value.atomLabels !== "all") return null
  if (value.highlight !== undefined) {
    if (!isPlainObject(value.highlight)) return null
    if (Object.keys(value.highlight).some((key) => !HIGHLIGHT_KEYS.has(key) || DANGEROUS_KEYS.has(key))) return null
    if (value.highlight.atoms !== undefined && !isDenseUniqueIndexes(value.highlight.atoms)) return null
    if (value.highlight.bonds !== undefined && !isDenseUniqueIndexes(value.highlight.bonds)) return null
  }
  if (value.view === "2d") {
    if (value.style !== undefined) return null
  } else {
    if (value.format !== "molfile" || !options.enable3D) return null
    if (value.style !== undefined && value.style !== "ball-and-stick" && value.style !== "space-filling") return null
  }
  return value as unknown as MoleculeDefinition
}

async function validateChemistry(definition: MoleculeDefinition, options: ResolvedOptions): Promise<ParsedChemistry | null> {
  try {
    const OCL = await loadOpenChemLib()
    const parsed = definition.format === "smiles"
      ? OCL.Molecule.fromSmiles(definition.source)
      : OCL.Molecule.fromMolfile(definition.source)
    const atomCount = parsed.getAllAtoms()
    const bondCount = parsed.getAllBonds()
    if (!Number.isSafeInteger(atomCount) || atomCount < 1 || atomCount > options.maxAtoms) return null
    if (!Number.isSafeInteger(bondCount) || bondCount < 0 || bondCount > options.maxBonds) return null
    if (definition.highlight?.atoms?.some((index) => index >= atomCount)) return null
    if (definition.highlight?.bonds?.some((index) => index >= bondCount)) return null
    if (definition.view === "3d") {
      let minZ = Number.POSITIVE_INFINITY
      let maxZ = Number.NEGATIVE_INFINITY
      for (let atom = 0; atom < atomCount; atom++) {
        const x = parsed.getAtomX(atom)
        const y = parsed.getAtomY(atom)
        const z = parsed.getAtomZ(atom)
        if (![x, y, z].every(Number.isFinite)) return null
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
      if (maxZ - minZ <= 1e-6) return null
    }
    return { definition, molecule: parsed, atomCount, bondCount }
  } catch {
    return null
  }
}

export async function validateMoleculeDefinition(value: unknown, options: MoleculeOptions = {}): Promise<MoleculeResult> {
  let resolved: ResolvedOptions
  try {
    resolved = resolveOptions(options)
  } catch {
    throw new TypeError("Invalid molecule options")
  }
  const definition = validateShape(value, resolved)
  if (!definition) return invalid()
  const chemistry = await validateChemistry(definition, resolved)
  return chemistry ? { ok: true, value: chemistry.definition } : invalid()
}

export async function parseMoleculeDefinition(source: string, options: MoleculeOptions = {}): Promise<MoleculeResult> {
  if (typeof source !== "string") return invalid()
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return invalid()
  }
  return validateMoleculeDefinition(value, options)
}

function loadingOutput(): RenderOutput {
  return { kind: "html", html: '<div data-aigui-molecule-loading aria-label="Loading molecule"></div>' }
}

function errorOutput(): RenderOutput {
  return { kind: "html", html: '<div data-aigui-molecule-error role="img" aria-label="Molecule could not be rendered.">Molecule could not be rendered.</div>' }
}

const SAFE_SVG_ELEMENTS = new Set(["svg", "g", "path", "line", "polyline", "polygon", "circle", "ellipse", "rect", "text", "tspan", "defs", "clipPath"])
const SAFE_SVG_ATTRIBUTES = new Set([
  "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "transform",
  "clip-path", "id", "class", "style", "xmlns",
])

function safeSvgElement(svgSource: string, width: number, height: number): SVGElement | null {
  const parsed = new DOMParser().parseFromString(svgSource, "image/svg+xml")
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") return null
  for (const element of Array.from(parsed.querySelectorAll("*"))) {
    if (!SAFE_SVG_ELEMENTS.has(element.localName)) {
      element.remove()
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value
      if (!SAFE_SVG_ATTRIBUTES.has(attribute.name) || /^on/i.test(attribute.name) || /url\s*\(|javascript:|data:/i.test(value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  const svg = document.importNode(parsed.documentElement, true) as unknown as SVGElement
  svg.setAttribute("width", "100%")
  svg.removeAttribute("height")
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", "Molecular structure")
  svg.setAttribute("style", `display:block;width:100%;height:auto;max-width:${width}px;max-height:${height}px;margin:auto`)
  return svg
}

function mount2D(svgSource: string, options: ResolvedOptions): RenderOutput {
  return {
    kind: "mount",
    mount(host) {
      host.replaceChildren()
      host.setAttribute("data-aigui-molecule", "2d")
      const svg = safeSvgElement(svgSource, options.width, options.height)
      if (!svg) {
        host.appendChild(moleculeErrorElement())
        return () => host.replaceChildren()
      }
      host.appendChild(svg)
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        host.replaceChildren()
      }
    },
  }
}

type Viewer = {
  addModel(source: string, format: string): unknown
  addStyle(selection: Record<string, unknown>, style: Record<string, unknown>): unknown
  clear(): unknown
  getCanvas(): HTMLCanvasElement
  removeAllLabels(): unknown
  removeAllModels(): unknown
  removeAllShapes(): unknown
  render(): unknown
  resize(): unknown
  setStyle(selection: Record<string, unknown>, style: Record<string, unknown>): unknown
  zoomTo(): unknown
}

const ELEMENT_COLORS = {
  H: 0xffffff, C: 0x909090, N: 0x3050f8, O: 0xff0d0d, F: 0x90e050, P: 0xff8000,
  S: 0xffff30, Cl: 0x1ff01f, Br: 0xa62929, I: 0x940094,
}

function mount3D(definition: Molecule3DDefinition, options: ResolvedOptions): RenderOutput {
  return {
    kind: "mount",
    mount(host) {
      let disposed = false
      let viewer: Viewer | undefined
      let observer: ResizeObserver | undefined
      let reset: HTMLButtonElement | undefined
      host.replaceChildren()
      host.setAttribute("data-aigui-molecule", "3d")
      host.style.position = "relative"
      host.style.width = "100%"
      host.style.maxWidth = `${options.width}px`
      host.style.height = `${options.height}px`
      const viewport = document.createElement("div")
      viewport.style.width = "100%"
      viewport.style.height = "100%"
      reset = document.createElement("button")
      reset.type = "button"
      reset.textContent = "Reset"
      reset.setAttribute("data-aigui-molecule-reset", "")
      const onReset = () => {
        if (disposed || !viewer) return
        viewer.zoomTo()
        viewer.render()
      }
      reset.addEventListener("click", onReset)
      host.append(viewport, reset)

      void import("3dmol")
        .then((module) => {
          if (disposed) return
          const createViewer = (module as unknown as { createViewer: (element: HTMLElement, config: Record<string, unknown>) => Viewer }).createViewer
          viewer = createViewer(viewport, { backgroundColor: "white", defaultcolors: ELEMENT_COLORS })
          if (disposed) return
          viewer.addModel(definition.source, "mol")
          const style = definition.style ?? "ball-and-stick"
          viewer.setStyle({}, style === "space-filling"
            ? { sphere: { scale: 1, colorscheme: "default" } }
            : { stick: { radius: 0.18, colorscheme: "default" }, sphere: { scale: 0.28, colorscheme: "default" } })
          if (definition.highlight?.atoms?.length) {
            viewer.addStyle({ index: definition.highlight.atoms }, { sphere: { color: 0xffc400, scale: 0.48 } })
          }
          if (definition.highlight?.bonds?.length) {
            void validateChemistry(definition, options).then((chemistry) => {
              if (disposed || !viewer || !chemistry) return
              const atoms = new Set<number>()
              for (const bond of definition.highlight?.bonds ?? []) {
                atoms.add(chemistry.molecule.getBondAtom(0, bond))
                atoms.add(chemistry.molecule.getBondAtom(1, bond))
              }
              viewer.addStyle({ index: [...atoms] }, { stick: { color: 0xffc400, radius: 0.3 } })
              viewer.render()
            }).catch(() => undefined)
          }
          viewer.zoomTo()
          viewer.render()
          if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(() => {
              if (!disposed && viewer) viewer.resize()
            })
            observer.observe(host)
          }
        })
        .catch(() => {
          if (disposed) return
          host.replaceChildren(moleculeErrorElement())
        })

      return () => {
        if (disposed) return
        disposed = true
        reset?.removeEventListener("click", onReset)
        observer?.disconnect()
        if (viewer) {
          let canvas: HTMLCanvasElement | undefined
          try { canvas = viewer.getCanvas() } catch { canvas = undefined }
          try { viewer.removeAllLabels() } catch { /* cleanup is best effort */ }
          try { viewer.removeAllShapes() } catch { /* cleanup is best effort */ }
          try { viewer.removeAllModels() } catch { /* cleanup is best effort */ }
          try { viewer.clear() } catch { /* cleanup is best effort */ }
          try {
            const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")
            gl?.getExtension("WEBGL_lose_context")?.loseContext()
          } catch { /* cleanup is best effort */ }
        }
        viewer = undefined
        host.replaceChildren()
      }
    },
  }
}

async function createOutput(node: ASTNode, options: ResolvedOptions): Promise<RenderOutput> {
  if (node.complete !== true) return loadingOutput()
  let value: unknown
  try {
    value = JSON.parse(node.content ?? "")
  } catch {
    return errorOutput()
  }
  const definition = validateShape(value, options)
  if (!definition) return errorOutput()
  const chemistry = await validateChemistry(definition, options)
  if (!chemistry) return errorOutput()
  if (definition.view === "3d") return mount3D(definition, options)
  try {
    for (const atom of definition.highlight?.atoms ?? []) chemistry.molecule.setAtomSelection(atom, true)
    for (const bond of definition.highlight?.bonds ?? []) {
      chemistry.molecule.setAtomSelection(chemistry.molecule.getBondAtom(0, bond), true)
      chemistry.molecule.setAtomSelection(chemistry.molecule.getBondAtom(1, bond), true)
    }
    const svg = chemistry.molecule.toSVG(options.width, options.height, undefined, {
      showAtomNumber: definition.atomLabels === "all",
      autoCrop: false,
    })
    return mount2D(svg, options)
  } catch {
    return errorOutput()
  }
}

export function moleculePromptSpec(options: MoleculeOptions = {}): string {
  const resolved = resolveOptions(options)
  return [
    "Molecules (one complete-gated fenced block): ```molecule <strict JSON>```.",
    'Exact root fields: {"version":1,"format":"smiles|molfile","source":"...","view":"2d|3d","style":"ball-and-stick|space-filling"?,"atomLabels":"standard|all"?,"highlight":{"atoms":[0],"bonds":[0]}?}. No unknown fields.',
    "SMILES supports 2d only. Molfile supports 2d and 3d; 3d requires genuine finite non-flat z coordinates.",
    `Source is local text only and must be at most ${resolved.maxSourceBytes} UTF-8 bytes. Atom and bond indexes are zero-based unique nonnegative integers.`,
    "Never emit URLs, scripts, network requests, remote resources, HTML, credentials, download/get/autoload/fetch instructions, or executable content.",
  ].join("\n")
}

export const moleculeCss = `
[data-aigui-molecule]{box-sizing:border-box;max-width:100%;overflow:hidden}
[data-aigui-molecule="2d"] svg{display:block;max-width:100%;height:auto}
[data-aigui-molecule="3d"] canvas{display:block;max-width:100%}
[data-aigui-molecule-reset]{position:absolute;right:.5rem;bottom:.5rem;z-index:1;padding:.35rem .65rem;border:1px solid currentColor;border-radius:.35rem;background:Canvas;color:CanvasText;cursor:pointer}
[data-aigui-molecule-loading]{min-height:10rem;border-radius:.5rem;background:linear-gradient(90deg,transparent,rgba(127,127,127,.12),transparent);background-size:200% 100%;animation:aigui-molecule-loading 1.2s linear infinite}
[data-aigui-molecule-error]{padding:1rem;border:1px solid currentColor;border-radius:.5rem}
@keyframes aigui-molecule-loading{to{background-position:-200% 0}}
`.trim()

export function molecule(options: MoleculeOptions = {}): AIGuiPlugin {
  const resolved = resolveOptions(options)
  const outputs = new WeakMap<ASTNode, Promise<RenderOutput>>()
  const render = (node: ASTNode): Promise<RenderOutput> => {
    const cached = outputs.get(node)
    if (cached) return cached
    const output = createOutput(node, resolved).catch(() => errorOutput())
    outputs.set(node, output)
    return output
  }
  return { name: "molecule", nodeRenderers: { molecule: render }, promptSpec: moleculePromptSpec(resolved) }
}

function moleculeErrorElement(): HTMLElement {
  const error = document.createElement("div")
  error.setAttribute("data-aigui-molecule-error", "")
  error.setAttribute("role", "img")
  error.setAttribute("aria-label", "Molecule could not be rendered.")
  error.textContent = "Molecule could not be rendered."
  return error
}
