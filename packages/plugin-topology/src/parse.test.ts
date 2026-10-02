import { describe, expect, it } from "vitest"
import { parseTopology } from "./parse"
import { topologyPromptSpec } from "./prompt"

const ok = (value: unknown) => {
  const result = parseTopology(JSON.stringify(value))
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const refused = (value: unknown) => {
  const result = parseTopology(JSON.stringify(value))
  if (result.ok) throw new Error("expected a refusal")
  return result.error
}
const nodes = [{ id: "a" }, { id: "b" }]

describe("parseTopology", () => {
  it("parses every worked example it teaches, in both languages", () => {
    for (const locale of ["zh-CN", "en"]) {
      for (const block of topologyPromptSpec(locale).split("```topology\n").slice(1)) {
        const result = parseTopology(block.slice(0, block.indexOf("```")))
        expect(result.ok ? "" : result.error, locale).toBe("")
      }
    }
  })

  it("keeps what was said and nothing it was not", () => {
    const value = ok({ nodes: [{ id: "a", kind: "disk", state: "primary", note: "/data" }, { id: "b" }], links: [{ from: "a", to: "b" }] })
    expect(value.nodes[0]).toEqual({ id: "a", kind: "disk", state: "primary", note: "/data" })
    expect(value.nodes[1]).toEqual({ id: "b" })
    expect(value.links).toEqual([{ from: "a", to: "b" }])
    expect(value).not.toHaveProperty("steps")
  })

  it("names every broken reference", () => {
    expect(refused({ nodes, links: [{ from: "a", to: "c" }] })).toBe('links[0].to "c" is not a node')
    expect(refused({ nodes: [{ id: "a", group: "h9" }] })).toBe('nodes[0].group "h9" is not a group — declare it in groups')
    expect(refused({ nodes, steps: [{ caption: "x", states: { z: "failed" } }] })).toBe('steps[0].states "z" is not a node')
    expect(refused({ nodes, links: [{ from: "a", to: "b" }], steps: [{ caption: "x", links: { l1: "down" } }] })).toBe('steps[0].links.l1 is not a link id — give the link an "id" to change its state')
    expect(refused({ nodes, steps: [{ caption: "x", messages: [{ from: "a", to: "q" }] }] })).toBe('steps[0].messages[0].to "q" is not a node')
  })

  it("refuses what cannot be drawn honestly", () => {
    expect(refused({ nodes: [{ id: "a" }, { id: "a" }] })).toBe('node id "a" is used twice')
    expect(refused({ groups: [{ id: "g", group: "g" }], nodes: [{ id: "a", group: "g" }] })).toBe('group "g" is inside itself')
    expect(refused({ groups: [{ id: "g" }], nodes })).toBe('group "g" has no nodes in it')
    expect(refused({ nodes, links: [{ from: "a", to: "a" }] })).toBe('links[0] links "a" to itself')
    expect(refused({ nodes: [{ id: "a", state: "happy" }] })).toMatch(/^nodes\[0\]\.state must be one of primary, active/)
    expect(refused({ nodes: [{ id: "a", x: 10 }] })).toMatch(/^nodes\[0\]\.x is not a field here/)
    expect(refused({ nodes: [] })).toBe("nodes must be a non-empty array")
    expect(refused({ nodes, steps: [{ messages: [] }] })).toBe("steps[0].caption is required")
  })

  it("lets a group sit inside another, as a VM's inside its host's", () => {
    const value = ok({ groups: [{ id: "host" }, { id: "vm", group: "host" }], nodes: [{ id: "svc", group: "vm" }] })
    expect(value.groups).toEqual([{ id: "host" }, { id: "vm", group: "host" }])
  })
})
