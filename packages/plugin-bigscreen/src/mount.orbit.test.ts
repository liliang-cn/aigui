// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { forgetPositions } from "./positions"
import type { Graph3dPanel, ScreenDefinition } from "./types"

/**
 * The orbit mode as it is actually mounted: a layout stepped a few steps per animation frame,
 * pushed into a live chart, stopping when it has settled and when the panel goes away.
 *
 * Both the WebGL loader and ECharts itself are stubbed. There is no WebGL in jsdom, and the point
 * of the test is the loop around the chart rather than anything the chart draws: which options it
 * is handed, how many times, and whether it is still being handed them after it should not be.
 */
vi.mock("echarts-gl", () => ({ default: {} }))

interface FakeChart {
  setOption: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
}

const charts: FakeChart[] = []

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>()
  return {
    ...actual,
    init: () => {
      const chart: FakeChart = { setOption: vi.fn(), dispose: vi.fn(), on: vi.fn(), resize: vi.fn() }
      charts.push(chart)
      return chart
    },
  }
})

const { mountScreen } = await import("./mount")

const GRAPH: Graph3dPanel = {
  kind: "graph3d",
  title: "Who reported what",
  nodes: [
    { id: "kyiv", name: "Kyiv", type: "place" },
    { id: "moscow", name: "Moscow", type: "place" },
    { id: "reuters", name: "Reuters", type: "outlet" },
    { id: "tass", name: "TASS", type: "outlet" },
    { id: "convoy", name: "Convoy crossing", type: "event" },
  ],
  edges: [
    { from: "reuters", to: "convoy", type: "reported" },
    { from: "convoy", to: "kyiv", type: "located" },
    { from: "tass", to: "moscow", type: "located" },
  ],
}

const screen = (panels: unknown[]): ScreenDefinition => ({ theme: "dark", columns: 12, panels: panels as ScreenDefinition["panels"] })

let frames: Array<FrameRequestCallback | undefined> = []

/** Run every frame that is pending, and every frame those ask for, until nothing asks for one. */
function flush(limit = 2000): number {
  let run = 0
  for (let i = 0; i < limit; i++) {
    const next = frames.findIndex((frame) => frame !== undefined)
    if (next === -1) break
    const frame = frames[next]
    frames[next] = undefined
    frame?.(performance.now())
    run++
  }
  return run
}

beforeEach(() => {
  charts.length = 0
  frames = []
  forgetPositions()
  // ECharts is not initialised on an element with no size, and jsdom gives every element none.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 800, configurable: true })
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames[handle - 1] = undefined
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mount one panel and wait for the deferred `echarts-gl` import to land. */
async function mounted(panel: unknown): Promise<{ chart: FakeChart; destroy: () => void }> {
  const host = document.createElement("div")
  const destroy = mountScreen(host, screen([panel]), true)
  await vi.waitFor(() => expect(charts).toHaveLength(1))
  return { chart: charts[0], destroy }
}

const optionOf = (chart: FakeChart, call: number): Record<string, any> => chart.setOption.mock.calls[call][0] as Record<string, any>

describe("an orbit graph settling", () => {
  it("draws a model first and then moves it, a few steps at a time", async () => {
    const { chart, destroy } = await mounted(GRAPH)
    const first = optionOf(chart, 0)
    expect(first.grid3D).toBeDefined()
    expect(first.series.map((s: any) => s.type)).toEqual(["line3D", "scatter3D"])
    expect(first.grid3D.viewControl.autoRotate).toBe(true)

    // Every frame replaces both series' data and nothing else — the camera, the lights and the
    // box are not rebuilt sixty times a second.
    expect(flush()).toBeGreaterThan(10)
    const frame = optionOf(chart, 1)
    expect(Object.keys(frame)).toEqual(["series"])
    expect(frame.series).toHaveLength(2)
    // Applied now, not lazily: this already runs once per animation frame, so deferring it to
    // ECharts' own next frame only puts the picture a frame behind the layout.
    expect(chart.setOption.mock.calls[1][1]).toMatchObject({ notMerge: false, lazyUpdate: false })
    // And it moved: the entities are not where they were painted the first time.
    expect(optionOf(chart, chart.setOption.mock.calls.length - 1).series[1].data[0].value).not.toEqual(first.series[1].data[0].value)
    destroy()
  })

  it("stops asking for frames once the layout has settled", async () => {
    const { chart, destroy } = await mounted(GRAPH)
    flush()
    const settled = chart.setOption.mock.calls.length
    expect(flush()).toBe(0)
    expect(chart.setOption).toHaveBeenCalledTimes(settled)
    destroy()
  })

  it("stops on the way out, before the chart it would draw into is gone", async () => {
    const { chart, destroy } = await mounted(GRAPH)
    flush(3)
    const drawn = chart.setOption.mock.calls.length
    destroy()
    expect(chart.dispose).toHaveBeenCalled()
    expect(flush()).toBe(0)
    expect(chart.setOption).toHaveBeenCalledTimes(drawn)
  })

  it("hands over a settled model, still, when the host says nothing may move", async () => {
    const host = document.createElement("div")
    const destroy = mountScreen(host, screen([GRAPH]), false)
    await vi.waitFor(() => expect(charts).toHaveLength(1))
    const chart = charts[0]
    expect(optionOf(chart, 0).grid3D.viewControl.autoRotate).toBe(false)
    // No settling to watch, so no frames asked for and nothing drawn twice.
    expect(flush()).toBe(0)
    expect(chart.setOption).toHaveBeenCalledTimes(1)
    destroy()
  })

  it("leaves the flat mode exactly as it was: one option, no loop", async () => {
    const { chart, destroy } = await mounted({ ...GRAPH, mode: "flat" })
    expect(optionOf(chart, 0).series[0].type).toBe("graphGL")
    expect(flush()).toBe(0)
    expect(chart.setOption).toHaveBeenCalledTimes(1)
    destroy()
  })

  /** Every node's distance to the first one, over the distance between the first two. */
  const shape = (nodes: Array<{ value: number[] }>): number[] => {
    const gap = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    const unit = gap(nodes[0].value, nodes[1].value)
    return nodes.map((n) => gap(nodes[0].value, n.value) / unit)
  }

  it("picks a re-rendered graph up where it left off instead of reshuffling it", async () => {
    // The panel is remounted every time the model writes another line into the fence. A reader
    // who has just understood the shape must not watch it dissolve because three names arrived.
    const first = await mounted(GRAPH)
    flush()
    const finished = optionOf(first.chart, first.chart.setOption.mock.calls.length - 1).series[1].data
    first.destroy()

    charts.length = 0
    const same = await mounted(GRAPH)
    const resumed = optionOf(same.chart, 0).series[1].data
    // The same graph again opens on exactly the picture it closed on, not on a new throw of the
    // dice.
    for (const [index, node] of finished.entries()) {
      expect(resumed[index].id).toBe(node.id)
      for (const axis of [0, 1, 2]) expect(resumed[index].value[axis]).toBeCloseTo(node.value[axis], 3)
    }
    same.destroy()

    charts.length = 0
    const grown = await mounted({ ...GRAPH, nodes: [...GRAPH.nodes, { id: "afp", name: "AFP", type: "outlet" }] })
    const reopened = optionOf(grown.chart, 0).series[1].data
    // One more entity reframes the picture — the box is fitted to what is in it — but the
    // entities that were already there keep their arrangement rather than being thrown again.
    expect(reopened).toHaveLength(GRAPH.nodes.length + 1)
    expect(reopened.map((n: { id: string }) => n.id).slice(0, GRAPH.nodes.length)).toEqual(finished.map((n: { id: string }) => n.id))
    for (const [index, ratio] of shape(finished).entries()) {
      expect(shape(reopened.slice(0, GRAPH.nodes.length))[index]).toBeCloseTo(ratio, 3)
    }
    grown.destroy()
  })

  it("does throw the dice again for a graph it has never drawn", async () => {
    // The other half of the bargain: the memory is keyed on the panel, so a different graph does
    // not inherit a shape that was never its own.
    const first = await mounted(GRAPH)
    flush()
    const finished = optionOf(first.chart, first.chart.setOption.mock.calls.length - 1).series[1].data
    first.destroy()

    charts.length = 0
    const other = await mounted({ ...GRAPH, title: "Something else" })
    const fresh = optionOf(other.chart, 0).series[1].data
    expect(shape(fresh)).not.toEqual(shape(finished))
    other.destroy()
  })

  it("says what it needs when there is no WebGL, in the mode a host never asked for either", async () => {
    // The fallback is shared with the flat mode, and the legend has to go with it in both.
    const host = document.createElement("div")
    const destroy = mountScreen(host, screen([GRAPH]), true)
    await vi.waitFor(() => expect(charts).toHaveLength(1))
    expect(host.querySelector(".aigui-bs-graph-legend")).not.toBeNull()
    destroy()
  })
})
