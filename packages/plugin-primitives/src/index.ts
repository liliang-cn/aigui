import { parsePartialJSON, type AIGuiPlugin, type ASTNode, type RenderOutput } from "@ai-gui/core"

const el = (tag: string, props: Record<string, unknown> | undefined, children: RenderOutput[]): RenderOutput => ({ kind: "element", tag, props, children })
const text = (s: string): RenderOutput => ({ kind: "html", html: escapeHtml(s) })
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
function data(node: ASTNode): any {
  return parsePartialJSON(node.content ?? "").data ?? {}
}

function renderList(node: ASTNode): RenderOutput {
  const items: unknown[] = data(node).items ?? []
  return el("ul", { "data-aigui-primitive": "list" }, items.map((i) => el("li", undefined, [text(String(i))])))
}
function renderKeyValue(node: ASTNode): RenderOutput {
  const pairs: Record<string, unknown> = data(node).pairs ?? {}
  return el("dl", { "data-aigui-primitive": "key-value" }, Object.entries(pairs).flatMap(([k, v]) => [el("dt", undefined, [text(k)]), el("dd", undefined, [text(String(v))])]))
}
function renderTable(node: ASTNode): RenderOutput {
  const d = data(node)
  const headers: unknown[] = d.headers ?? []
  const rows: unknown[][] = d.rows ?? []
  const thead = el("thead", undefined, [el("tr", undefined, headers.map((h) => el("th", undefined, [text(String(h))])))])
  const tbody = el("tbody", undefined, rows.map((r) => el("tr", undefined, (r ?? []).map((c) => el("td", undefined, [text(String(c))])))))
  return el("table", { "data-aigui-primitive": "table" }, [thead, tbody])
}
function renderLayout(node: ASTNode): RenderOutput {
  const d = data(node)
  const dir = d.direction === "row" ? "row" : "column"
  const items: string[] = d.items ?? []
  return el("div", { "data-aigui-primitive": "layout", style: `display:flex;flex-direction:${dir}` }, items.map((i) => el("div", undefined, [text(String(i))])))
}

export function primitivesPromptSpec(): string {
  return [
    "Primitive UI blocks (fenced): ```list {\"items\":[...]}```; ```table {\"headers\":[...],\"rows\":[[...]]}```;",
    "```key-value {\"pairs\":{\"k\":\"v\"}}```; ```layout {\"direction\":\"row|column\",\"items\":[...]}```.",
  ].join("\n")
}

export function primitives(): AIGuiPlugin {
  return {
    name: "primitives",
    nodeRenderers: { list: renderList, "key-value": renderKeyValue, table: renderTable, layout: renderLayout },
    promptSpec: primitivesPromptSpec(),
  }
}
