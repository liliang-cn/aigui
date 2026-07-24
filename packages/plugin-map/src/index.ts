import type { AIGuiPlugin, ASTNode, RenderOutput } from "@ai-gui/core"
import { mapCss } from "./css"
import { mountMapDocument } from "./mount"
import { resolveMapOptions } from "./options"
import { mapPromptSpec } from "./prompt"
import type { MapOptions } from "./types"
import { parseMapDocument } from "./validate"

export { mapCss } from "./css"
export { MapDocumentError, MapLimitError } from "./errors"
export { DEFAULT_MAP_LIMITS } from "./limits"
export { mountMapDocument } from "./mount"
export { resolveMapOptions } from "./options"
export { mapPromptSpec } from "./prompt"
export { parseMapDocument, validateMapDocument } from "./validate"
export type * from "./types"

export function map(options: MapOptions = {}): AIGuiPlugin {
  const resolved = resolveMapOptions(options)
  const outputs = new WeakMap<ASTNode, RenderOutput>()
  const rejected = new WeakSet<ASTNode>()
  const render = (node: ASTNode): RenderOutput => {
    const cached = outputs.get(node)
    if (cached) return cached
    let output: RenderOutput
    if (!node.complete) output = { kind: "html", html: '<div data-aigui-map-loading="" data-block-type="map"></div>' }
    else if (rejected.has(node)) output = invalidOutput()
    else {
      try {
        const document = parseMapDocument(node.content ?? "")
        output = renderMap(document, resolved)
      } catch { output = invalidOutput() }
    }
    outputs.set(node, output)
    return output
  }
  return {
    name: "map",
    nodeRenderers: { map: render },
    onASTCommit: (nodes) => {
      let accepted = false
      for (const node of nodes) {
        if (node.type !== "map" || !node.complete) continue
        if (accepted) rejected.add(node)
        else accepted = true
      }
    },
    promptSpec: mapPromptSpec(),
    css: mapCss,
  }
}

function invalidOutput(): RenderOutput { return { kind: "html", html: '<div data-aigui-map-invalid="" role="alert">Invalid map.</div>' } }

function renderMap(document: import("./types").MapDocument, options: ReturnType<typeof resolveMapOptions>): RenderOutput {
  return {
    kind: "element",
    tag: "section",
    props: { "data-aigui-map": "", "aria-label": document.ariaLabel ?? "Interactive map" },
    children: [
      { kind: "mount", mount: (host) => mountMapDocument(host, document, options) },
      mapSummary(document),
    ],
  }
}

function mapSummary(document: import("./types").MapDocument): RenderOutput {
  const items: RenderOutput[] = []
  for (const layer of document.layers) {
    if (layer.type === "markers") {
      for (const marker of layer.items) items.push(summaryItem(marker.label, marker.description))
    } else if (layer.type === "route" && (layer.label || layer.description)) {
      items.push(summaryItem(layer.label ?? "Route", layer.description))
    } else if (layer.type === "geojson" && layer.labelProperty) {
      for (const feature of layer.data.features) {
        const value = feature.properties?.[layer.labelProperty]
        if (value !== undefined && value !== null) items.push(summaryItem(String(value)))
      }
    }
  }
  if (!items.length) items.push(summaryItem("Map data is available in the interactive region."))
  return { kind: "element", tag: "aside", props: { "data-aigui-map-summary": "", "aria-label": "Map summary" }, children: [
    { kind: "element", tag: "ul", children: items },
  ] }
}

function summaryItem(label: string, description?: string): RenderOutput {
  return { kind: "element", tag: "li", children: [text(description ? `${label}: ${description}` : label)] }
}

function text(value: string): RenderOutput {
  return { kind: "html", html: value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;") }
}
