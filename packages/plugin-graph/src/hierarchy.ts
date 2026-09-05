import type { GraphDefinition } from "./types"

/**
 * A layered layout for the `subClassOf` forest.
 *
 * A class hierarchy is a tree, and a tree drawn by a force layout is a tree the reader has to
 * find. Roots go on the top row in the order they were declared, every class sits one row below
 * its parent, leaves are dealt out left to right, and each parent is centred over its children —
 * the picture a textbook draws.
 *
 * Coordinates are in a unit box: `x` from 0 to 1 across the columns, `y` the row index over the
 * last row (0 for the top row, 1 for the bottom; a single row is all at y = 0). The renderer
 * scales them to its own width and height.
 */
export interface HierarchyLayout {
  at: Map<string, [number, number]>
  rows: number
  /** How many leaf columns the widest row spreads over. */
  columns: number
}

export function hierarchyLayout(def: GraphDefinition): HierarchyLayout {
  const ids = new Set(def.classes.map((cls) => cls.id))
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const cls of def.classes) {
    const parent = cls.subClassOf
    if (parent === undefined || !ids.has(parent)) {
      roots.push(cls.id)
      continue
    }
    const siblings = children.get(parent)
    if (siblings) siblings.push(cls.id)
    else children.set(parent, [cls.id])
  }

  // Each leaf takes a column; a parent's x is the mean of its children's. Depth is the row.
  const x = new Map<string, number>()
  const row = new Map<string, number>()
  let column = 0
  let deepest = 0
  const place = (id: string, depth: number): number => {
    row.set(id, depth)
    deepest = Math.max(deepest, depth)
    const below = children.get(id) ?? []
    if (below.length === 0) {
      const mine = column++
      x.set(id, mine)
      return mine
    }
    const centres = below.map((child) => place(child, depth + 1))
    const mine = centres.reduce((sum, c) => sum + c, 0) / centres.length
    x.set(id, mine)
    return mine
  }
  for (const root of roots) place(root, 0)

  const columns = Math.max(1, column)
  const rows = deepest + 1
  const at = new Map<string, [number, number]>()
  for (const cls of def.classes) {
    const cx = x.get(cls.id) ?? 0
    const cy = row.get(cls.id) ?? 0
    // Column centres, so one column sits in the middle rather than on the left edge.
    at.set(cls.id, [(cx + 0.5) / columns, rows === 1 ? 0 : cy / (rows - 1)])
  }
  return { at, rows, columns }
}
