import type { Vec3 } from "./layout3d"
import type { Graph3dPanel } from "./types"

/**
 * Where each graph settled last time it was drawn.
 *
 * A streamed answer re-renders the same fence as the model writes it: a graph of twenty entities
 * becomes the same graph of twenty-three, and the reconciler tears the panel down and mounts a
 * new one. Without a memory the new layout starts from the hash again, every node lands somewhere
 * else, and the reader — who was reading it — watches the picture they had just understood
 * dissolve because three names arrived.
 *
 * So the positions are kept by node id, under a key that deliberately does *not* depend on the
 * node set: the ids that are still there resume exactly where they were, and only the new ones
 * have to find a place. It is module-level state, which is what makes it survive the remount; it
 * is bounded so a long conversation full of graphs cannot grow it without limit, and it is
 * forgettable so tests do not leak into each other.
 */

/** How many graphs are remembered at once. Beyond this the least recently used one is dropped. */
export const REMEMBERED_GRAPHS = 8

/** Insertion order is the recency order: `Map` iterates oldest first, which is the whole trick. */
const settled = new Map<string, Map<string, Vec3>>()

/**
 * What identifies a graph across a re-render.
 *
 * The title, because that is the one thing a model rewriting its own fence keeps stable while the
 * entities underneath it change. A panel with no title falls back to its first entity, which is
 * the next most stable thing there is — a graph usually keeps the entity it was drawn around.
 * The prefix keeps a panel titled `kyiv` from colliding with an untitled one whose first node is
 * `kyiv`.
 */
export function graphKey(panel: Graph3dPanel): string {
  return panel.title !== undefined ? `title:${panel.title}` : `node:${panel.nodes[0]?.id ?? ""}`
}

/** The positions this graph settled into last time, by node id, or nothing. */
export function recallPositions(key: string): ReadonlyMap<string, Vec3> | undefined {
  const found = settled.get(key)
  if (!found) return undefined
  // Re-inserting moves it to the young end, so a graph still being looked at is never the one
  // dropped to make room.
  settled.delete(key)
  settled.set(key, found)
  return found
}

/**
 * Remember where a graph settled.
 *
 * The positions are copied out of the buffer rather than kept by reference: `Layout.positions()`
 * hands back the live array, and a layout that is still running would otherwise have this
 * remember whatever it became several frames later.
 */
export function rememberPositions(key: string, ids: readonly string[], positions: Float32Array): void {
  const map = new Map<string, Vec3>()
  for (const [index, id] of ids.entries()) {
    map.set(id, [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]])
  }
  settled.delete(key)
  settled.set(key, map)
  while (settled.size > REMEMBERED_GRAPHS) {
    const oldest = settled.keys().next()
    if (oldest.done) break
    settled.delete(oldest.value)
  }
}

/** Drop every remembered graph. For tests, and for a host tearing a page down. */
export function forgetPositions(): void {
  settled.clear()
}
