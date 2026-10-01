// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { parseTopology } from "./parse"
import { topologyPromptSpec } from "./prompt"
import type { TopologyDefinition } from "./types"

const example = (): TopologyDefinition => {
  const block = topologyPromptSpec("zh-CN").split("```topology\n")[1]
  const result = parseTopology(block.slice(0, block.indexOf("```")))
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe("playing", () => {
  it("moves this step's messages while the states are still the last step's", async () => {
    const { topology } = await import("./index")
    const definition = example()
    const plugin = topology({ stepMs: 1000 })
    const host = document.createElement("div")
    document.body.appendChild(host)
    let now = 0
    const frames: FrameRequestCallback[] = []
    const realRaf = globalThis.requestAnimationFrame
    const realNow = performance.now.bind(performance)
    globalThis.requestAnimationFrame = (cb) => (frames.push(cb), frames.length)
    performance.now = () => now
    try {
      const out = await plugin.nodeRenderers!.topology({ type: "topology", content: JSON.stringify(definition), complete: true } as never)
      if (out.kind !== "mount") throw new Error("expected a mount")
      out.mount(host)
      const run = (at: number) => {
        now = at
        frames.splice(0).forEach((cb) => cb(at))
      }
      run(200) // step 1, the write in flight towards d1
      const svg = () => host.querySelector("svg")!
      const dots = () => [...svg().querySelectorAll(":scope > circle")]
      expect(host.querySelector("[data-count]")!.textContent).toBe("1/5")
      expect(dots()).toHaveLength(1)
      run(1100) // step 2 begins: the data, d1 → d2
      run(1300)
      expect(host.querySelector("[data-count]")!.textContent).toBe("2/5")
      expect(dots()).toHaveLength(1)
      // Step 1's highlight is over.
      expect(svg().querySelectorAll('rect[opacity="0.55"]')).toHaveLength(0)
    } finally {
      globalThis.requestAnimationFrame = realRaf
      performance.now = realNow
    }
  })
})
