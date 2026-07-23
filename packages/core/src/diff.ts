import type { ASTNode, Patch } from "./types"

/** Produce a minimal set of patches turning `prev` into `next`, keyed by node key. */
export function diffAst(prev: ASTNode[], next: ASTNode[]): Patch[] {
  const patches: Patch[] = []
  const nextKeys = new Set(next.map((n) => n.key))
  const working = [...prev]

  for (let index = working.length - 1; index >= 0; index--) {
    if (!nextKeys.has(working[index].key)) {
      patches.push({ op: "remove", key: working[index].key })
      working.splice(index, 1)
    }
  }
  for (let index = 0; index < next.length; index++) {
    const node = next[index]
    const currentIndex = working.findIndex((candidate) => candidate.key === node.key)
    if (currentIndex === -1) {
      patches.push({ op: "insert", index, node })
      working.splice(index, 0, node)
      continue
    }
    if (currentIndex !== index) {
      patches.push({ op: "move", key: node.key, index })
      const [moved] = working.splice(currentIndex, 1)
      working.splice(index, 0, moved)
    }
    if (!nodeEqual(working[index], node)) {
      patches.push({ op: "update", key: node.key, node })
      working[index] = node
    }
  }
  return patches
}

/** Apply patches in order, primarily for framework adapters and verification. */
export function applyPatches(nodes: ASTNode[], patches: Patch[]): ASTNode[] {
  const next = [...nodes]
  for (const patch of patches) {
    if (patch.op === "insert") {
      next.splice(patch.index, 0, patch.node)
    } else if (patch.op === "remove") {
      const index = next.findIndex((node) => node.key === patch.key)
      if (index !== -1) next.splice(index, 1)
    } else if (patch.op === "move") {
      const index = next.findIndex((node) => node.key === patch.key)
      if (index !== -1) {
        const [node] = next.splice(index, 1)
        next.splice(patch.index, 0, node)
      }
    } else {
      const index = next.findIndex((node) => node.key === patch.key)
      if (index !== -1) next[index] = patch.node
    }
  }
  return next
}

function nodeEqual(a: ASTNode, b: ASTNode): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}
