import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const manifest = (name: string) => JSON.parse(readFileSync(new URL(`../../${name}/package.json`, import.meta.url), "utf8")) as { dependencies: Record<string, string> }

describe("the ECharts this package installs", () => {
  /**
   * `echarts-gl` accepts ECharts 5 or 6 as a peer, so without a range of its own here npm installs
   * ECharts 6 at the top of the tree, and every chart plugin — which wants 5 — gets a private
   * nested copy: three extra copies, 165 MB, and `echarts-gl` registering its 3D types on a
   * different instance from the one the charts are drawn with. Declaring the plugins' range here
   * makes npm hoist one ECharts 5 that satisfies everything.
   */
  it("is declared, with the chart plugins' own range", () => {
    const range = manifest("plugin-chart").dependencies.echarts
    expect(manifest("image").dependencies.echarts).toBe(range)
    expect(manifest("plugin-bigscreen").dependencies.echarts).toBe(range)
    expect(manifest("plugin-dashboard").dependencies.echarts).toBe(range)
  })
})
