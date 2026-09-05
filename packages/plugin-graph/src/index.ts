import type { AIGuiPlugin, ASTNode, NodeRenderContext, RenderOutput } from "@ai-gui/core"
import { footerHtml, mountGraph } from "./chrome"
import { palette } from "./palette"
import { parseGraph } from "./parse"
import { graphPromptSpec } from "./prompt"
import { escape, renderGraphSVG } from "./render2d"
import type { GraphOptions } from "./types"

export { graphPromptSpec } from "./prompt"
export { parseGraph } from "./parse"
export { ancestors, checkRelations, classColour, instanceGraph, isSubClassOf, ontologyGraph, propertyColour } from "./ontology"
export type { LayerGraph, LayoutLink, LayoutNode } from "./ontology"
export { createLayout, hash, layoutSteps, settle } from "./layout"
export type { Layout } from "./layout"
export { hierarchyLayout } from "./hierarchy"
export type { HierarchyLayout } from "./hierarchy"
export { renderGraphSVG, degrees, labelled, legend } from "./render2d"
export type { RenderedGraph, RenderOptions, LegendEntry, PlacedNode } from "./render2d"
export { violationLines } from "./chrome"
export { palette } from "./palette"
export type { Palette } from "./palette"
export type {
  ClassDef,
  EntityDef,
  GraphDefinition,
  GraphError,
  GraphLayer,
  GraphOptions,
  GraphResult,
  GraphView,
  PropertyDef,
  RelationDef,
  Violation,
} from "./types"

export const graphCss = [
  "[data-aigui-graph]{margin:0.75rem 0;max-width:100%}",
  "[data-aigui-graph-toolbar]{display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.4rem;font-size:0.8rem}",
  "[data-aigui-graph-toolbar] [role=group]{display:inline-flex;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:0.4rem;overflow:hidden}",
  "[data-aigui-graph-toolbar] button{appearance:none;border:0;background:transparent;color:inherit;font:inherit;padding:0.2rem 0.6rem;cursor:pointer;opacity:0.7}",
  "[data-aigui-graph-toolbar] button+button{border-left:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
  "[data-aigui-graph-toolbar] button[aria-pressed=true]{background:color-mix(in srgb,currentColor 12%,transparent);opacity:1;font-weight:600}",
  "[data-aigui-graph-stage]{position:relative;width:100%;border-radius:0.5rem;overflow:hidden;background:color-mix(in srgb,currentColor 3%,transparent)}",
  "[data-aigui-graph-canvas]{position:relative;width:100%;height:100%}",
  "[data-aigui-graph-canvas] svg{display:block;width:100%;height:100%;cursor:grab;touch-action:none}",
  "[data-aigui-graph-canvas] svg:active{cursor:grabbing}",
  "[data-aigui-graph-canvas] [data-graph-item]{cursor:pointer}",
  "[data-aigui-graph-canvas] svg[data-graph-active] [data-graph-item]:not([data-active]):not([data-neighbour]){opacity:0.18}",
  "[data-aigui-graph-canvas] svg[data-graph-active] [data-graph-edge]:not([data-neighbour]){opacity:0.08}",
  "[data-aigui-graph-canvas] svg[data-graph-active] [data-graph-edge][data-neighbour]{opacity:1;stroke-width:2.5}",
  "[data-aigui-graph-canvas] [data-graph-item],[data-aigui-graph-canvas] [data-graph-edge]{transition:opacity 120ms ease}",
  "[data-aigui-graph-canvas] canvas{display:block;width:100%;height:100%;touch-action:none}",
  "[data-aigui-graph-tip]{position:absolute;z-index:2;max-width:220px;padding:0.4rem 0.55rem;border-radius:0.4rem;font-size:0.75rem;line-height:1.35;pointer-events:none;border:1px solid;box-shadow:0 4px 14px rgba(0,0,0,0.12)}",
  "[data-aigui-graph-tip] strong{display:block;font-size:0.8rem}",
  "[data-aigui-graph-tip] [data-graph-tip-class]{opacity:0.7}",
  "[data-aigui-graph-tip] dl{display:grid;grid-template-columns:auto 1fr;gap:0 0.5rem;margin:0.3rem 0 0}",
  "[data-aigui-graph-tip] dt{opacity:0.6}",
  "[data-aigui-graph-tip] dd,[data-aigui-graph-tip] ul{margin:0}",
  "[data-aigui-graph-tip] ul{padding:0.3rem 0 0;list-style:none;opacity:0.85}",
  "[data-aigui-graph-note]{margin-top:0.3rem;font-size:0.8rem;opacity:0.7}",
  "[data-aigui-graph-violations]{margin-top:0.5rem;padding:0.45rem 0.7rem;border-radius:0.4rem;font-size:0.8rem;background:color-mix(in srgb,#dc2626 8%,transparent);border:1px solid color-mix(in srgb,#dc2626 35%,transparent)}",
  "[data-aigui-graph-violations-title]{font-weight:600}",
  "[data-aigui-graph-violations] ul{margin:0.25rem 0 0;padding-left:1.1rem}",
  "[data-aigui-graph-caption]{margin-top:0.35rem;font-size:0.875rem;opacity:0.7;text-align:center}",
  "[data-aigui-graph-loading]{min-height:8rem;border-radius:0.5rem;background:currentColor;opacity:0.06}",
  ":where([data-aigui-graph-error]){padding:0.5rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 25%,transparent)}",
].join("")

function failed(message: string): RenderOutput {
  const text = escape(message)
  return { kind: "html", html: `<div data-aigui-graph-error role="img" aria-label="${text}">${text}</div>`, trusted: true }
}

/**
 * Knowledge graphs and ontologies: entities and typed relations, optionally under a schema of
 * classes and properties, drawn as a 2D figure or a 3D model — and checked against the schema.
 *
 * The protocol is two flat lists per layer rather than nested triples or Turtle, because a model
 * writes flat lists correctly and a reader looks at a picture. The one piece of reasoning is the
 * one that catches the mistake a model actually makes: a property's domain and range, with
 * `subClassOf` honoured, so an organisation "working at" a person is marked rather than drawn.
 */
export function graph(options: GraphOptions = {}): AIGuiPlugin {
  const height = options.height ?? 420
  const labelBudget = options.labelBudget ?? 20
  const render = (node: ASTNode, context?: NodeRenderContext): RenderOutput => {
    if (node.complete === false) {
      return { kind: "html", html: '<div data-aigui-graph-loading aria-label="Loading graph"></div>' }
    }
    const parsed = parseGraph(node.content ?? "", options)
    if (!parsed.ok) return failed(parsed.error.message)
    const definition = parsed.value
    if (options.interactive === false) {
      const layer = definition.classes.length > 0 ? definition.layer : "instances"
      const rendered = renderGraphSVG(definition, layer, palette(context?.theme), { width: 640, height, labelBudget })
      const html = `<figure data-aigui-graph=""><div data-aigui-graph-stage="" style="height:${height}px"><div data-aigui-graph-canvas="">${rendered.svg}</div></div>${footerHtml(definition, context?.locale)}</figure>`
      return { kind: "html", html, trusted: true }
    }
    return {
      kind: "mount",
      mount: (el) =>
        mountGraph(el, definition, {
          height,
          labelBudget,
          three: options.three !== false,
          theme: context?.theme,
          locale: context?.locale,
          onEntityClick: options.onEntityClick,
        }),
    }
  }

  return {
    name: "graph",
    css: graphCss,
    nodeRenderers: { graph: render },
    // A half-streamed JSON object is not a graph; without this the reader watches the layout
    // reshuffle as each entity lands.
    isBlockComplete: (_type, raw) => {
      const text = raw.trim()
      if (!text.startsWith("{") || !text.endsWith("}")) return false
      try {
        JSON.parse(text)
        return true
      } catch {
        return false
      }
    },
    promptSpec: (locale) => graphPromptSpec(locale),
  }
}
