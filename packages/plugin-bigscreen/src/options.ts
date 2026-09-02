import type { EChartsCoreOption } from "echarts/core"
import type { Palette } from "./palette"
import { withAlpha } from "./palette"
import type { Chart3dPanel, ChartPanel, GaugePanel, GlobePanel } from "./types"

/**
 * ECharts options built from panels.
 *
 * Pure functions of the panel and the palette, so they can be tested without a canvas and so
 * the same panel draws the same chart on every screen.
 */

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"

/** Format a number for a label: thousands grouped, up to `decimals` places. */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** The colour a gauge shows at `fraction` of its range. */
export function gaugeColour(fraction: number, thresholds: [number, number] | undefined, c: Palette): string {
  if (!thresholds) return c.accent
  if (fraction >= thresholds[1]) return c.bad
  if (fraction >= thresholds[0]) return c.warn
  return c.good
}

export function gaugeOption(panel: GaugePanel, c: Palette, animate: boolean): EChartsCoreOption {
  const max = panel.max ?? 100
  const fraction = Math.max(0, Math.min(1, panel.value / max))
  const colour = gaugeColour(fraction, panel.thresholds, c)
  const ring = panel.style === "ring"
  return {
    animation: animate,
    animationDuration: 1400,
    animationEasing: "cubicOut",
    series: [
      {
        type: "gauge",
        startAngle: ring ? 90 : 210,
        endAngle: ring ? -270 : -30,
        min: 0,
        max,
        radius: "92%",
        center: ["50%", ring ? "50%" : "58%"],
        progress: { show: true, width: ring ? 14 : 16, roundCap: true, itemStyle: { color: colour, shadowBlur: 12, shadowColor: withAlpha(colour, 0.5) } },
        pointer: { show: !ring, length: "60%", width: 4, itemStyle: { color: colour } },
        axisLine: { lineStyle: { width: ring ? 14 : 16, color: [[1, c.track]] } },
        axisTick: { show: false },
        splitLine: { show: !ring, length: 8, lineStyle: { color: c.muted, width: 1 } },
        axisLabel: { show: !ring, color: c.muted, fontSize: 10, distance: 18, fontFamily: FONT },
        anchor: { show: !ring, size: 10, itemStyle: { color: colour } },
        title: { show: false },
        detail: {
          valueAnimation: animate,
          offsetCenter: [0, ring ? 0 : "28%"],
          fontSize: ring ? 28 : 24,
          fontWeight: 700,
          fontFamily: FONT,
          color: c.text,
          formatter: (value: number) => `${formatNumber(value, Number.isInteger(panel.value) ? 0 : 1)}${panel.unit ?? ""}`,
        },
        data: [{ value: panel.value }],
      },
    ],
  }
}

/**
 * The screen's palette laid over whatever the model wrote.
 *
 * The model's option wins on anything it sets; this only fills in the colours, the font, the
 * transparent background and the entrance animation a screen wants, so a plain `bar` series
 * still looks like it belongs.
 */
export function chartOption(panel: ChartPanel, c: Palette, animate: boolean): EChartsCoreOption {
  const axisStyle = { axisLine: { lineStyle: { color: c.gridLine } }, axisLabel: { color: c.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: c.gridLine } } }
  const withAxisDefaults = (axis: unknown): unknown => {
    if (Array.isArray(axis)) return axis.map((a) => ({ ...axisStyle, ...(a as object) }))
    if (axis && typeof axis === "object") return { ...axisStyle, ...axis }
    return axis
  }
  const option = panel.option
  return {
    backgroundColor: "transparent",
    color: c.series,
    textStyle: { color: c.text, fontFamily: FONT },
    animation: animate,
    animationDuration: 1200,
    animationEasing: "cubicOut",
    grid: { left: 40, right: 16, top: 28, bottom: 28, containLabel: true },
    legend: { textStyle: { color: c.muted } },
    tooltip: { trigger: "axis" },
    ...option,
    ...(option.xAxis !== undefined ? { xAxis: withAxisDefaults(option.xAxis) } : {}),
    ...(option.yAxis !== undefined ? { yAxis: withAxisDefaults(option.yAxis) } : {}),
  }
}

export function chart3dOption(panel: Chart3dPanel, c: Palette, animate: boolean): EChartsCoreOption {
  const values = panel.data.map((p) => p[2])
  const max = Math.max(...values)
  const min = Math.min(...values)
  const axis = (categories: string[] | undefined, name: string) => ({
    type: categories ? "category" : "value",
    data: categories,
    name: "",
    axisLine: { lineStyle: { color: c.gridLine } },
    axisLabel: { color: c.muted, fontFamily: FONT },
    splitLine: { lineStyle: { color: c.gridLine } },
    axisPointer: { show: false },
    nameTextStyle: { color: c.muted },
    id: name,
  })
  const series: Record<string, unknown> = {
    type: panel.type,
    data: panel.data,
    shading: "lambert",
    emphasis: { itemStyle: { color: c.text } },
  }
  if (panel.type === "bar3D") series.bevelSize = 0.2
  if (panel.type === "scatter3D") series.symbolSize = 9
  if (panel.type === "line3D") series.lineStyle = { width: 3, color: c.accent }
  if (panel.type === "surface") series.wireframe = { show: true, lineStyle: { color: withAlpha(c.accent, 0.35) } }
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: FONT },
    tooltip: {},
    visualMap: {
      show: false,
      min,
      max,
      dimension: 2,
      inRange: { color: [withAlpha(c.accent, 0.55), c.accent, c.series[1]] },
    },
    xAxis3D: axis(panel.xAxis, "x"),
    yAxis3D: axis(panel.yAxis, "y"),
    zAxis3D: { type: "value", name: "", axisLine: { lineStyle: { color: c.gridLine } }, axisLabel: { color: c.muted, fontFamily: FONT }, splitLine: { lineStyle: { color: c.gridLine } } },
    grid3D: {
      boxWidth: 100,
      boxDepth: 80,
      boxHeight: 60,
      axisPointer: { show: false },
      light: { main: { intensity: 1.3, shadow: false, alpha: 40, beta: 30 }, ambient: { intensity: 0.5 } },
      viewControl: { autoRotate: animate && panel.rotate !== false, autoRotateSpeed: 8, distance: 190, alpha: 24, beta: 35, projection: "perspective" },
      environment: "none",
    },
    series: [series],
  }
}

/**
 * A globe without a satellite photograph.
 *
 * ECharts' globe wants a texture, and the usual one is an image fetched from somewhere — which a
 * page must not do on a model's say-so. So the texture is painted here: a deep sphere with a
 * graticule, which is what a data wall's globe looks like anyway. Arcs get a moving trail.
 */
export function globeTexture(c: Palette, theme: "dark" | "light"): string | undefined {
  if (typeof document === "undefined") return undefined
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (!ctx) return undefined
  ctx.fillStyle = theme === "dark" ? "#0b1a33" : "#dbe7f5"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = withAlpha(c.accent, theme === "dark" ? 0.28 : 0.35)
  ctx.lineWidth = 1.2
  for (let lng = 0; lng < 360; lng += 15) {
    const x = (lng / 360) * canvas.width
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  for (let lat = 15; lat < 180; lat += 15) {
    const y = (lat / 180) * canvas.height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }
  // The equator, a touch stronger, so the tilt reads.
  ctx.strokeStyle = withAlpha(c.accent, 0.6)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, canvas.height / 2)
  ctx.lineTo(canvas.width, canvas.height / 2)
  ctx.stroke()
  // Handed over as a data URL rather than the canvas itself: that is the path echarts-gl treats
  // as an image to decode, and it involves no request.
  return canvas.toDataURL("image/png")
}

export function globeOption(panel: GlobePanel, c: Palette, animate: boolean, texture: string | undefined): EChartsCoreOption {
  const arcs = (panel.arcs ?? []).map((arc) => ({ coords: [arc.from, arc.to], name: arc.label }))
  // On a globe the third value is altitude, so the size lives in a fourth: a point worth 320
  // must still sit on the surface, not 320 units above it.
  const points = (panel.points ?? []).map((point) => ({ name: point.label, value: [point.coord[0], point.coord[1], 0, point.value ?? 1] }))
  const maxValue = Math.max(1, ...points.map((p) => p.value[3] as number))
  return {
    backgroundColor: "transparent",
    globe: {
      baseTexture: texture,
      shading: "color",
      environment: "none",
      globeRadius: 78,
      atmosphere: { show: true, color: c.accent, glowPower: 5, innerGlowPower: 2, offset: 4 },
      light: { ambient: { intensity: 1 }, main: { intensity: 0.2 } },
      // Close enough that a continent fills a good part of the panel, and slow enough that the
      // route it opened on stays in view for a while.
      viewControl: { autoRotate: animate && panel.rotate !== false, autoRotateSpeed: 3, distance: 150, targetCoord: arcs[0]?.coords[0] ?? points[0]?.value.slice(0, 2) },
    },
    series: [
      {
        type: "lines3D",
        coordinateSystem: "globe",
        blendMode: "lighter",
        lineStyle: { width: 2.5, color: c.series[1], opacity: 0.9 },
        effect: { show: animate, period: 3, trailWidth: 4, trailLength: 0.3, trailOpacity: 1, trailColor: "#ffffff" },
        data: arcs,
      },
      {
        type: "scatter3D",
        coordinateSystem: "globe",
        symbolSize: (value: number[]) => 6 + 10 * Math.sqrt((value[3] ?? 1) / maxValue),
        itemStyle: { color: c.series[1], opacity: 0.9 },
        label: { show: true, formatter: "{b}", color: c.text, fontSize: 11, fontFamily: FONT, backgroundColor: "transparent", distance: 6 },
        data: points,
      },
    ],
  }
}
