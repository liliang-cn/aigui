import type { ASTNode, Patch } from "./types"

/** Produce a minimal set of patches turning `prev` into `next`, keyed by node key. */
export function diffAst(prev: ASTNode[], next: ASTNode[]): Patch[] {
  const patches: Patch[] = []
  const prevByKey = new Map(prev.map((n) => [n.key, n]))
  const nextKeys = new Set(next.map((n) => n.key))

  next.forEach((node, index) => {
    const old = prevByKey.get(node.key)
    if (!old) patches.push({ op: "insert", index, node })
    else if (!nodeEqual(old, node)) patches.push({ op: "update", key: node.key, node })
  })
  for (const node of prev) {
    if (!nextKeys.has(node.key)) patches.push({ op: "remove", key: node.key })
  }
  return patches
}

function nodeEqual(a: ASTNode, b: ASTNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
