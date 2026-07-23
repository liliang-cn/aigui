import type { ASTNode, Patch } from "@ai-gui/core"

export function applyPatches(nodes: ASTNode[], patches: Patch[]): ASTNode[] {
  let out = nodes.slice()
  for (const p of patches) {
    if (p.op === "insert") {
      out.splice(p.index, 0, p.node)
    } else if (p.op === "update") {
      const i = out.findIndex((n) => n.key === p.key)
      if (i >= 0) out[i] = p.node
    } else if (p.op === "remove") {
      out = out.filter((n) => n.key !== p.key)
    } else if (p.op === "move") {
      const i = out.findIndex((n) => n.key === p.key)
      if (i >= 0) {
        const [node] = out.splice(i, 1)
        out.splice(p.index, 0, node)
      }
    }
  }
  return out
}
