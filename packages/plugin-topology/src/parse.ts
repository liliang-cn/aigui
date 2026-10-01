import type { LinkState, NodeKind, NodeState, ParseResult, TopologyDefinition, TopologyGroup, TopologyLink, TopologyNode, TopologyStep } from "./types"

export const NODE_KINDS: readonly NodeKind[] = ["server", "vm", "container", "disk", "database", "network", "balancer", "client", "service", "process", "queue", "cloud"]
export const NODE_STATES: readonly NodeState[] = ["primary", "active", "ok", "secondary", "standby", "syncing", "degraded", "warning", "failed", "down", "offline", "diskless", "unknown"]
const LINK_STATES: readonly LinkState[] = ["up", "down", "active"]

const TOP = new Set(["title", "caption", "direction", "groups", "nodes", "links", "steps"])
const NODE = new Set(["id", "label", "kind", "group", "state", "note"])
const GROUP = new Set(["id", "label", "group"])
const LINK = new Set(["id", "from", "to", "label", "style", "directed", "state"])
const STEP = new Set(["caption", "messages", "states", "links", "highlight"])
const MESSAGE = new Set(["from", "to", "label"])

class Refusal extends Error {}
const fail = (message: string): never => {
  throw new Refusal(message)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

function fields(raw: unknown, allowed: Set<string>, at: string): Record<string, unknown> {
  if (!isRecord(raw)) fail(`${at} must be an object`)
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) if (!allowed.has(key)) fail(`${at}.${key} is not a field here — allowed: ${[...allowed].join(", ")}`)
  return record
}

function text(value: unknown, at: string, max: number, required = false): string | undefined {
  if (value === undefined) return required ? fail(`${at} is required`) : undefined
  if (typeof value !== "string" || value.trim() === "") fail(`${at} must be a non-empty string`)
  if ((value as string).length > max) fail(`${at} must be at most ${max} characters`)
  return value as string
}

function oneOf<T extends string>(value: unknown, list: readonly T[], at: string): T | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !list.includes(value as T)) fail(`${at} must be one of ${list.join(", ")}`)
  return value as T
}

function list(value: unknown, at: string, max: number): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${at} must be an array`)
  if ((value as unknown[]).length > max) fail(`${at} has more than ${max} entries`)
  return value as unknown[]
}

/**
 * Validate one `topology` fence, or say exactly what is wrong with it.
 *
 * Every reference is checked — a link to a node that is not there, a group inside itself, a step
 * that sets the state of a link with no id — because a diagram drawn around a broken reference
 * shows something the model did not say, and the error is the one thing that gets it fixed.
 */
export function parseTopology(source: string, options: { maxNodes?: number; maxSourceBytes?: number } = {}): ParseResult {
  const maxNodes = options.maxNodes ?? 60
  if (new TextEncoder().encode(source).byteLength > (options.maxSourceBytes ?? 48 * 1024)) return { ok: false, error: "Topology definition is too large." }
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, error: "Topology definition is not valid JSON." }
  }
  try {
    return { ok: true, value: build(raw, maxNodes) }
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message }
    throw error
  }
}

function build(raw: unknown, maxNodes: number): TopologyDefinition {
  const top = fields(raw, TOP, "topology")
  const definition: TopologyDefinition = { nodes: [] }
  const title = text(top.title, "title", 120)
  if (title) definition.title = title
  const caption = text(top.caption, "caption", 300)
  if (caption) definition.caption = caption
  const direction = oneOf(top.direction, ["LR", "TB"] as const, "direction")
  if (direction) definition.direction = direction

  const groups: TopologyGroup[] = list(top.groups, "groups", 24).map((entry, i) => {
    const at = `groups[${i}]`
    const g = fields(entry, GROUP, at)
    const group: TopologyGroup = { id: text(g.id, `${at}.id`, 48, true)! }
    const label = text(g.label, `${at}.label`, 60)
    if (label) group.label = label
    const parent = text(g.group, `${at}.group`, 48)
    if (parent) group.group = parent
    return group
  })
  const groupIds = new Set<string>()
  for (const g of groups) {
    if (groupIds.has(g.id)) fail(`group id "${g.id}" is used twice`)
    groupIds.add(g.id)
  }
  for (const g of groups) {
    if (g.group && !groupIds.has(g.group)) fail(`group "${g.id}" is inside "${g.group}", which is not a group`)
    // Walk up: a group that reaches itself is inside itself.
    const seen = new Set([g.id])
    for (let up = g.group; up; up = groups.find((x) => x.id === up)?.group) {
      if (seen.has(up)) fail(`group "${g.id}" is inside itself`)
      seen.add(up)
    }
  }
  if (groups.length > 0) definition.groups = groups

  const rawNodes = list(top.nodes, "nodes", maxNodes)
  if (rawNodes.length === 0) fail("nodes must be a non-empty array")
  const nodes: TopologyNode[] = rawNodes.map((entry, i) => {
    const at = `nodes[${i}]`
    const n = fields(entry, NODE, at)
    const node: TopologyNode = { id: text(n.id, `${at}.id`, 48, true)! }
    const label = text(n.label, `${at}.label`, 48)
    if (label) node.label = label
    const kind = oneOf(n.kind, NODE_KINDS, `${at}.kind`)
    if (kind) node.kind = kind
    const group = text(n.group, `${at}.group`, 48)
    if (group) {
      if (!groupIds.has(group)) fail(`${at}.group "${group}" is not a group — declare it in groups`)
      node.group = group
    }
    const state = oneOf(n.state, NODE_STATES, `${at}.state`)
    if (state) node.state = state
    const note = text(n.note, `${at}.note`, 60)
    if (note) node.note = note
    return node
  })
  const nodeIds = new Set<string>()
  for (const n of nodes) {
    if (nodeIds.has(n.id)) fail(`node id "${n.id}" is used twice`)
    if (groupIds.has(n.id)) fail(`"${n.id}" is both a node and a group`)
    nodeIds.add(n.id)
  }
  definition.nodes = nodes
  // A group with nothing in it has no box to draw — and was almost certainly meant to hold something.
  for (const g of groups) {
    const holds = (id: string): boolean => nodes.some((n) => n.group === id) || groups.some((c) => c.group === id && holds(c.id))
    if (!holds(g.id)) fail(`group "${g.id}" has no nodes in it`)
  }
  const known = (id: string, at: string) => {
    if (!nodeIds.has(id)) fail(`${at} "${id}" is not a node`)
  }

  const links: TopologyLink[] = list(top.links, "links", 120).map((entry, i) => {
    const at = `links[${i}]`
    const l = fields(entry, LINK, at)
    const link: TopologyLink = { from: text(l.from, `${at}.from`, 48, true)!, to: text(l.to, `${at}.to`, 48, true)! }
    known(link.from, `${at}.from`)
    known(link.to, `${at}.to`)
    if (link.from === link.to) fail(`${at} links "${link.from}" to itself`)
    const id = text(l.id, `${at}.id`, 48)
    if (id) link.id = id
    const label = text(l.label, `${at}.label`, 40)
    if (label) link.label = label
    const style = oneOf(l.style, ["solid", "dashed"] as const, `${at}.style`)
    if (style) link.style = style
    if (l.directed !== undefined) {
      if (typeof l.directed !== "boolean") fail(`${at}.directed must be true or false`)
      link.directed = l.directed as boolean
    }
    const state = oneOf(l.state, LINK_STATES, `${at}.state`)
    if (state) link.state = state
    return link
  })
  const linkIds = new Set<string>()
  for (const l of links) {
    if (!l.id) continue
    if (linkIds.has(l.id)) fail(`link id "${l.id}" is used twice`)
    linkIds.add(l.id)
  }
  if (links.length > 0) definition.links = links

  const steps: TopologyStep[] = list(top.steps, "steps", 24).map((entry, i) => {
    const at = `steps[${i}]`
    const s = fields(entry, STEP, at)
    const step: TopologyStep = { caption: text(s.caption, `${at}.caption`, 160, true)! }
    const messages = list(s.messages, `${at}.messages`, 12).map((m, j) => {
      const mat = `${at}.messages[${j}]`
      const r = fields(m, MESSAGE, mat)
      const message = { from: text(r.from, `${mat}.from`, 48, true)!, to: text(r.to, `${mat}.to`, 48, true)! } as { from: string; to: string; label?: string }
      known(message.from, `${mat}.from`)
      known(message.to, `${mat}.to`)
      const label = text(r.label, `${mat}.label`, 32)
      if (label) message.label = label
      return message
    })
    if (messages.length > 0) step.messages = messages
    if (s.states !== undefined) {
      if (!isRecord(s.states)) fail(`${at}.states must be an object of node id to state`)
      step.states = {}
      for (const [id, state] of Object.entries(s.states as Record<string, unknown>)) {
        known(id, `${at}.states`)
        step.states[id] = oneOf(state, NODE_STATES, `${at}.states.${id}`)!
      }
    }
    if (s.links !== undefined) {
      if (!isRecord(s.links)) fail(`${at}.links must be an object of link id to state`)
      step.links = {}
      for (const [id, state] of Object.entries(s.links as Record<string, unknown>)) {
        if (!linkIds.has(id)) fail(`${at}.links.${id} is not a link id — give the link an "id" to change its state`)
        step.links[id] = oneOf(state, LINK_STATES, `${at}.links.${id}`)!
      }
    }
    const highlight = list(s.highlight, `${at}.highlight`, 12).map((id, j) => {
      const h = text(id, `${at}.highlight[${j}]`, 48, true)!
      known(h, `${at}.highlight[${j}]`)
      return h
    })
    if (highlight.length > 0) step.highlight = highlight
    return step
  })
  if (steps.length > 0) definition.steps = steps
  return definition
}
