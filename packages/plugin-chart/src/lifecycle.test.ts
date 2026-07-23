// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { collectNodeRenderers, type ASTNode, type RenderOutput } from "@ai-gui/core"

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  glLoaded: vi.fn(),
  init: vi.fn(),
  setOption: vi.fn(),
  use: vi.fn(),
}))

vi.mock("echarts/core", () => ({ init: mocks.init, use: mocks.use }))
vi.mock("echarts/charts", () => ({
  BarChart: {}, BoxplotChart: {}, CandlestickChart: {}, CustomChart: {}, EffectScatterChart: {},
  FunnelChart: {}, GaugeChart: {}, GraphChart: {}, HeatmapChart: {}, LineChart: {}, LinesChart: {},
  MapChart: {}, ParallelChart: {}, PictorialBarChart: {}, PieChart: {}, RadarChart: {}, SankeyChart: {},
  ScatterChart: {}, SunburstChart: {}, ThemeRiverChart: {}, TreeChart: {}, TreemapChart: {},
}))
vi.mock("echarts/components", () => ({
  AriaComponent: {},
  AxisPointerComponent: {},
  BrushComponent: {},
  CalendarComponent: {},
  DataZoomComponent: {},
  DatasetComponent: {},
  GeoComponent: {},
  GraphicComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  ParallelComponent: {},
  PolarComponent: {},
  RadarComponent: {},
  SingleAxisComponent: {},
  TimelineComponent: {},
  TitleComponent: {},
  ToolboxComponent: {},
  TooltipComponent: {},
  TransformComponent: {},
  VisualMapComponent: {},
}))
vi.mock("echarts/features", () => ({ LabelLayout: {}, UniversalTransition: {} }))
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {}, SVGRenderer: {} }))
vi.mock("echarts-gl", () => { mocks.glLoaded(); return {} })

describe("plugin-chart lifecycle", () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.dispose.mockReset()
    mocks.init.mockReset()
    mocks.setOption.mockReset()
    mocks.use.mockClear()
    mocks.glLoaded.mockClear()
  })

  it("disposes the SSR instance when setOption throws", async () => {
    mocks.setOption.mockImplementation(() => { throw new Error("broken option") })
    mocks.init.mockReturnValue({
      dispose: mocks.dispose,
      renderToSVGString: vi.fn(),
      setOption: mocks.setOption,
    })
    const { chart } = await import("./index")
    const render = collectNodeRenderers([chart()]).chart

    const out = render({
      key: "0:chart",
      type: "chart",
      content: JSON.stringify({ series: [{ type: "bar", data: [1] }] }),
    } as ASTNode) as RenderOutput

    expect(out.kind).toBe("html")
    if (out.kind === "html") expect(out.html).toContain("data-aigui-chart-error")
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it("disposes the SSR instance when SVG rendering throws", async () => {
    mocks.init.mockReturnValue({
      dispose: mocks.dispose,
      renderToSVGString: vi.fn(() => { throw new Error("svg failed") }),
      setOption: mocks.setOption,
    })
    const { chart } = await import("./index")
    const render = collectNodeRenderers([chart()]).chart

    render({
      key: "0:chart",
      type: "chart",
      content: JSON.stringify({ series: [{ type: "bar", data: [1] }] }),
    } as ASTNode)

    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it("disposes a live instance and does not throw when setOption fails", async () => {
    mocks.setOption.mockImplementation(() => { throw new Error("interactive failed") })
    mocks.init.mockReturnValue({ dispose: mocks.dispose, setOption: mocks.setOption })
    const { chart } = await import("./index")
    const render = collectNodeRenderers([chart({ interactive: true })]).chart
    const out = render({
      key: "0:chart",
      type: "chart",
      content: JSON.stringify({ series: [{ type: "bar", data: [1] }] }),
    } as ASTNode) as RenderOutput
    if (out.kind !== "mount") throw new Error("expected mount")

    expect(() => out.mount(document.createElement("div"))).not.toThrow()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it("shares the optional echarts-gl import and disposes failed concurrent mounts", async () => {
    mocks.setOption.mockImplementation(() => { throw new Error("gl failed") })
    mocks.init.mockImplementation(() => ({ dispose: mocks.dispose, setOption: mocks.setOption }))
    const { chart } = await import("./index")
    const render = collectNodeRenderers([chart({ gl: true })]).chart
    const node = {
      key: "0:chart",
      type: "chart",
      content: JSON.stringify({ series: [{ type: "bar3D", data: [[0, 0, 1]] }] }),
    } as ASTNode
    const first = render(node) as RenderOutput
    const second = render(node) as RenderOutput
    if (first.kind !== "mount" || second.kind !== "mount") throw new Error("expected mounts")

    first.mount(document.createElement("div"))
    second.mount(document.createElement("div"))
    await vi.waitFor(() => expect(mocks.dispose).toHaveBeenCalledTimes(2))
    expect(mocks.glLoaded).toHaveBeenCalledOnce()
  })
})
