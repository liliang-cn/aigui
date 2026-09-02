import { describe, expect, it } from "vitest"
import { chart3dOption, chartOption, formatNumber, gaugeColour, gaugeOption, globeOption } from "./options"
import { palette } from "./palette"

const dark = palette({ theme: "dark" })
const light = palette({ theme: "light", accent: "#ff0000" })

describe("formatNumber", () => {
  it("groups thousands and holds the decimals asked for", () => {
    expect(formatNumber(12843000)).toBe("12,843,000")
    expect(formatNumber(266.4, 1)).toBe("266.4")
    expect(formatNumber(266.44, 0)).toBe("266")
  })
})

describe("gaugeColour", () => {
  it("turns amber and then red past the thresholds", () => {
    expect(gaugeColour(0.5, [0.6, 0.9], dark)).toBe(dark.good)
    expect(gaugeColour(0.7, [0.6, 0.9], dark)).toBe(dark.warn)
    expect(gaugeColour(0.95, [0.6, 0.9], dark)).toBe(dark.bad)
    expect(gaugeColour(0.95, undefined, dark)).toBe(dark.accent)
  })
})

describe("gaugeOption", () => {
  it("sweeps a dial and closes a ring", () => {
    const dial = gaugeOption({ kind: "gauge", value: 82, unit: "%" }, dark, true) as { series: Array<Record<string, unknown>> }
    expect(dial.series[0]).toMatchObject({ type: "gauge", max: 100, startAngle: 210, endAngle: -30 })
    expect((dial.series[0].pointer as { show: boolean }).show).toBe(true)
    const ring = gaugeOption({ kind: "gauge", value: 82, style: "ring" }, dark, false) as { animation: boolean; series: Array<Record<string, unknown>> }
    expect(ring.animation).toBe(false)
    expect(ring.series[0]).toMatchObject({ startAngle: 90, endAngle: -270 })
    expect((ring.series[0].pointer as { show: boolean }).show).toBe(false)
  })
  it("writes the value with its unit", () => {
    const option = gaugeOption({ kind: "gauge", value: 82, unit: "%" }, dark, true) as { series: Array<{ detail: { formatter: (v: number) => string } }> }
    expect(option.series[0].detail.formatter(82)).toBe("82%")
  })
})

describe("chartOption", () => {
  it("lays the palette under the model's option without overriding what it set", () => {
    const option = chartOption({ kind: "chart", option: { xAxis: { type: "category", data: ["a"] }, series: [{ type: "bar", data: [1] }], color: ["#123456"] } }, dark, true) as Record<string, unknown>
    expect(option.color).toEqual(["#123456"])
    expect(option.backgroundColor).toBe("transparent")
    expect((option.xAxis as { axisLabel: { color: string } }).axisLabel.color).toBe(dark.muted)
    expect(option.animation).toBe(true)
  })
  it("styles each axis of an array", () => {
    const option = chartOption({ kind: "chart", option: { yAxis: [{ type: "value" }, { type: "value" }] } }, light, false) as { yAxis: Array<{ axisLabel: { color: string } }> }
    expect(option.yAxis).toHaveLength(2)
    expect(option.yAxis[1].axisLabel.color).toBe(light.muted)
  })
})

describe("chart3dOption", () => {
  it("uses category axes when names are given and turns unless told not to", () => {
    const option = chart3dOption({ kind: "chart3d", type: "bar3D", data: [[0, 0, 1], [1, 0, 3]], xAxis: ["a", "b"], yAxis: ["y"] }, dark, true) as Record<string, any>
    expect(option.xAxis3D.type).toBe("category")
    expect(option.xAxis3D.data).toEqual(["a", "b"])
    expect(option.zAxis3D.type).toBe("value")
    expect(option.grid3D.viewControl.autoRotate).toBe(true)
    expect(option.visualMap).toMatchObject({ min: 1, max: 3, dimension: 2 })
    expect(option.series[0]).toMatchObject({ type: "bar3D", shading: "lambert" })
  })
  it("holds still when the panel or the host says so", () => {
    const still = chart3dOption({ kind: "chart3d", type: "scatter3D", data: [[0, 0, 0]], rotate: false }, dark, true) as Record<string, any>
    expect(still.grid3D.viewControl.autoRotate).toBe(false)
    const host = chart3dOption({ kind: "chart3d", type: "surface", data: [[0, 0, 0]] }, dark, false) as Record<string, any>
    expect(host.grid3D.viewControl.autoRotate).toBe(false)
    expect(host.series[0].wireframe.show).toBe(true)
  })
})

describe("globeOption", () => {
  it("draws arcs as lines with a trail and points as sized scatter, over the painted texture", () => {
    const option = globeOption({ kind: "globe", arcs: [{ from: [121.5, 31.2], to: [116.4, 39.9], label: "route" }], points: [{ coord: [121.5, 31.2], label: "SH", value: 4 }] }, dark, true, undefined) as Record<string, any>
    expect(option.globe.viewControl.autoRotate).toBe(true)
    expect(option.globe.viewControl.targetCoord).toEqual([121.5, 31.2])
    expect(option.series[0]).toMatchObject({ type: "lines3D", coordinateSystem: "globe" })
    expect(option.series[0].data[0]).toEqual({ coords: [[121.5, 31.2], [116.4, 39.9]], name: "route" })
    expect(option.series[0].effect.show).toBe(true)
    // Altitude 0 so the point sits on the surface; the value rides in the fourth slot.
    expect(option.series[1].data[0]).toEqual({ name: "SH", value: [121.5, 31.2, 0, 4] })
    expect(option.series[1].symbolSize([0, 0, 0, 4])).toBeCloseTo(16)
  })
})
