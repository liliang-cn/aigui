/** What a node is, which decides the small glyph drawn beside its name. */
export type NodeKind =
  | "server"
  | "vm"
  | "container"
  | "disk"
  | "database"
  | "network"
  | "balancer"
  | "client"
  | "service"
  | "process"
  | "queue"
  | "cloud"

/**
 * A node's state, from a fixed list so that the same word is always the same colour: a reader
 * learns "green is primary" once, across every diagram.
 */
export type NodeState =
  | "primary"
  | "active"
  | "ok"
  | "secondary"
  | "standby"
  | "syncing"
  | "degraded"
  | "warning"
  | "failed"
  | "down"
  | "offline"
  | "diskless"
  | "unknown"

export type LinkState = "up" | "down" | "active"

export interface TopologyNode {
  id: string
  /** Shown in the box. Default: the id. */
  label?: string
  kind?: NodeKind
  /** The group (host, rack, zone…) the node sits in. */
  group?: string
  /** Its state before any step runs. */
  state?: NodeState
  /** A second, quieter line under the label: an address, a size, a role. */
  note?: string
}

export interface TopologyGroup {
  id: string
  label?: string
  /** A group inside another: a VM's group inside a host's. */
  group?: string
}

export interface TopologyLink {
  /** Needed only to change the link's state in a step. */
  id?: string
  from: string
  to: string
  label?: string
  style?: "solid" | "dashed"
  /** Drawn with an arrowhead at `to`. Default true. */
  directed?: boolean
  state?: LinkState
}

/** Something travelling from one node to another during a step: a write, a heartbeat, an ack. */
export interface TopologyMessage {
  from: string
  to: string
  label?: string
}

/**
 * One moment of a process. What a step changes stays changed for the steps after it — a node that
 * fails in step 2 is still failed in step 4 — so each step says only what is new.
 */
export interface TopologyStep {
  caption: string
  messages?: TopologyMessage[]
  /** Node id to the state it is in from this step on. */
  states?: Record<string, NodeState>
  /** Link id to the state it is in from this step on. */
  links?: Record<string, LinkState>
  /** Nodes to draw attention to during this step only. */
  highlight?: string[]
}

export interface TopologyDefinition {
  title?: string
  caption?: string
  /** Which way the layers run: left to right, or top to bottom. Default "LR". */
  direction?: "LR" | "TB"
  groups?: TopologyGroup[]
  nodes: TopologyNode[]
  links?: TopologyLink[]
  steps?: TopologyStep[]
}

export interface TopologyOptions {
  /** Play the steps in the page. False draws the finished state with the steps numbered — what a picture needs. Default true. */
  animate?: boolean
  /** Milliseconds per step when playing. Default 2400. */
  stepMs?: number
  maxNodes?: number
  maxSourceBytes?: number
}

export type ParseResult = { ok: true; value: TopologyDefinition } | { ok: false; error: string }
