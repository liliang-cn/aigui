import type { EChartsCoreOption } from "echarts/core"
import { degrees, graphTooltip, typeColour, GRAPH_LABELS } from "./graph3d"
import { FONT } from "./options"
import type { Palette } from "./palette"
import type { Graph3dNode, Graph3dPanel } from "./types"

/**
 * The knowledge graph as a model you look at, rather than a picture you look down on.
 *
 * `layout3d.ts` puts the entities in space; this puts a camera in there with them. A `grid3D`
 * holds the coordinate system, a `scatter3D` draws the entities and a `line3D` draws the edges,
 * and the box the three of them share is deliberately invisible: a knowledge graph has no axes
 * to read, and the only thing an axis would add is furniture.
 *
 * Pure: the option is a function of the panel, the palette and the positions. The positions come
 * from outside because the layout is stepped — the mount loop hands the same builder a slightly
 * different set of coordinates every frame while the graph settles.
 */

/**
 * The half-width of the space the graph is drawn in, in the box's own units.
 *
 * Everything about the camera — the distance it sits at, how big a node reads at that distance —
 * is a constant, so the graph has to be scaled to it rather than the other way round. The layout
 * works in units of its own spring length and a graph of two thousand is naturally four times
 * wider than a graph of six; `orbitScale` divides that difference out, and this is what is left.
 */
export const ORBIT_EXTENT = 50

/** The cube the coordinate system is drawn in. Equal on all three sides, or the shape is a lie. */
export const ORBIT_BOX = 140

/** How solid an edge is drawn. */
const EDGE_OPACITY = 0.6

/**
 * The camera: how far out it sits, how fast it goes round, and the field of view it does it with.
 *
 * The distance is not a matter of taste. The graph is fitted to the box, so its furthest entity
 * sits half a box from the middle — and as the camera turns, that entity comes round to the near
 * side, where the perspective divide is over a distance of `ORBIT_DISTANCE - ORBIT_BOX / 2`
 * rather than `ORBIT_DISTANCE`. A camera framed for the middle therefore crops the graph twice a
 * revolution, which is exactly what it did at 180: an entity and its edge walked off the bottom
 * of the panel and back. So the distance is set from the near face, with room left over for the
 * labels, which stick out further than the entities they belong to.
 *
 * echarts-gl's grid3D camera has a vertical field of view of 50 degrees and is not configurable
 * through `viewControl`, so it is written down here rather than passed.
 */
export const ORBIT_FOV = 50
export const ORBIT_DISTANCE = 260
const ORBIT_SPEED = 6

/** Where the layout has to be moved to, and what it has to be multiplied by, to fill the box. */
export interface OrbitFrame {
  centre: [number, number, number]
  scale: number
}

/**
 * The graph's own bounding box, as the transform that puts it in the middle of the panel.
 *
 * Its box, not its bounding sphere, and its centre, not the origin. A settled graph is rarely a
 * ball: the eight-entity example comes out about 72 units wide, 26 tall and 40 deep, centred six
 * units left of where it started. Scaling that by its largest radius left it filling a fifth of
 * the panel and sitting off to one side — correct, and unreadable. Fitting the longest of the
 * three spans instead fills the frame in whichever direction the graph is actually long, and
 * because every other span is shorter by definition, nothing lands outside the box.
 */
export function orbitFrame(positions: Float32Array): OrbitFrame {
  if (positions.length < 3) return { centre: [0, 0, 0], scale: 1 }
  const low: [number, number, number] = [Infinity, Infinity, Infinity]
  const high: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], positions[i + axis])
      high[axis] = Math.max(high[axis], positions[i + axis])
    }
  }
  const centre: [number, number, number] = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2]
  const half = Math.max((high[0] - low[0]) / 2, (high[1] - low[1]) / 2, (high[2] - low[2]) / 2)
  // A graph of one entity, or of several in the same place, has nothing to scale.
  return { centre, scale: half > 0 ? ORBIT_EXTENT / half : 1 }
}

/** One entity, as `scatter3D` reads it. */
export interface OrbitNode {
  id: string
  name: string
  /** `[x, y, z, size]`: the first three place it, the fourth is what `symbolSize` reads. */
  value: [number, number, number, number]
  itemStyle: { color: string; opacity: number }
  /** Whether the name is written beside it. The rest are one hover away. */
  labelled: boolean
  /** Carried for the tooltip and the host's click; `type` is taken by ECharts. */
  nodeType: string | undefined
  degree: number
  node: Graph3dNode
}

/**
 * One vertex of the single polyline every edge is drawn on.
 *
 * echarts-gl has no series that draws many separate lines in a `grid3D`: `lines3D` lays out only
 * on a globe, a geo3D or a mapbox, and on a cartesian3D it throws for want of a layout. `line3D`
 * does work there, but it is one polyline through every point it is given — so the edges are
 * strung together into one, and the joins between them are made to disappear by giving both their
 * ends an opacity of zero. Four vertices per edge: the start twice and the end twice, transparent
 * on the outside and the edge's own colour on the inside.
 *
 *     A(0) -> A(c) -> B(c) -> B(0) -> A'(0) -> A'(c) -> ...
 *             \_____________/                  the edge          \__ the join, transparent at
 *                                                                    both ends and so invisible
 *
 * The doubled points are what the shader's own `position == positionPrev` branch is for, so they
 * cost two degenerate quads and no artefacts.
 *
 * `lineStyle`, not `itemStyle`: `line3D` declares `visualStyleAccessPath: "lineStyle"`, so a
 * colour written under `itemStyle` is read by nothing and every edge quietly comes out in the
 * series' one colour — with the joins between them drawn in it too, which turns a knowledge graph
 * into a ball of wool.
 */
export interface OrbitEdgePoint {
  value: [number, number, number]
  lineStyle: { color: string; opacity: number }
}

/** How many vertices one edge contributes to that polyline. */
export const EDGE_VERTICES = 4

export interface OrbitData {
  nodes: OrbitNode[]
  edges: OrbitEdgePoint[]
}

/**
 * The two series' data, from the panel and wherever the layout has got to.
 *
 * Built as one thing because the edges have to agree with the nodes: an edge is drawn between two
 * points, not between two ids, so a frame that moved the nodes and left the edges behind would
 * detach every line from both its ends.
 */
export function graphOrbitData(panel: Graph3dPanel, c: Palette, positions: Float32Array): OrbitData {
  const degree = degrees(panel)
  const weight = (node: Graph3dNode): number => node.value ?? degree.get(node.id) ?? 0
  const maxWeight = Math.max(1, ...panel.nodes.map(weight))
  // The busiest entities, plus the one the panel was drawn to point at — which is labelled
  // whether or not anything is connected to it, because that is the whole reason it was named.
  const named = new Set(
    [...panel.nodes]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, GRAPH_LABELS)
      .map((node) => node.id),
  )
  if (panel.focus !== undefined) named.add(panel.focus)

  const { centre, scale } = orbitFrame(positions)
  const at = (index: number): [number, number, number] => [
    (positions[index * 3] - centre[0]) * scale,
    (positions[index * 3 + 1] - centre[1]) * scale,
    (positions[index * 3 + 2] - centre[2]) * scale,
  ]

  const place = new Map<string, [number, number, number]>()
  const nodes = panel.nodes.map((node, index) => {
    const focused = node.id === panel.focus
    const [x, y, z] = at(index)
    place.set(node.id, [x, y, z])
    return {
      id: node.id,
      name: node.name,
      value: [x, y, z, (focused ? 6 : 0) + 6 + 16 * Math.sqrt(weight(node) / maxWeight)] as [number, number, number, number],
      itemStyle: { color: focused ? c.accent : typeColour(node.type, c, panel.types), opacity: 0.95 },
      labelled: named.has(node.id),
      nodeType: node.type,
      degree: degree.get(node.id) ?? 0,
      node,
    }
  })

  const origin: [number, number, number] = [0, 0, 0]
  const edges: OrbitEdgePoint[] = []
  for (const edge of panel.edges) {
    const from = place.get(edge.from) ?? origin
    const to = place.get(edge.to) ?? origin
    const color = typeColour(edge.type, c, panel.types)
    // Translucent on purpose: a graph read from across a room is read by where its entities are,
    // and a solid mesh of edges in front of them is what a hairball is made of.
    for (const [value, opacity] of [
      [from, 0],
      [from, EDGE_OPACITY],
      [to, EDGE_OPACITY],
      [to, 0],
    ] as const) {
      edges.push({ value, lineStyle: { color, opacity } })
    }
  }

  return { nodes, edges }
}

/**
 * An axis that exists to hold coordinates and to show nothing.
 *
 * Note what is *not* here: `axisLine: { show: false }`. echarts-gl records the axis line's two
 * endpoints only while it is drawing that line, and the camera-change handler then reads them to
 * decide which way the labels face — so an axis with its line switched off throws
 * `Cannot read properties of null` out of `_updateAxisLabelAlign` on every frame the camera
 * moves, which on an auto-rotating panel is all of them. The box is hidden with `grid3D.show`
 * instead, which takes the whole thing — faces, axes, labels — out of the scene and skips that
 * handler entirely.
 */
function hiddenAxis(): Record<string, unknown> {
  return {
    type: "value",
    name: "",
    // Pinned rather than fitted to the data: three axes each fitted to their own extent scale the
    // three dimensions differently, and an isotropic layout comes out stretched along whichever
    // one the graph happened to be narrowest in.
    min: -ORBIT_EXTENT,
    max: ORBIT_EXTENT,
    axisPointer: { show: false },
  }
}

/**
 * The whole scene.
 *
 * `animate` is the host's word and `panel.rotate` is the fence's; either one saying no stops the
 * camera. ECharts' own animation is off throughout — on each series as well as at the root,
 * because echarts-gl's vertex animation asks the *series* whether it may animate and does not
 * fall back to the screen's answer. While the graph settles this option's data is replaced every
 * frame, and an animated transition would spend that frame interpolating towards positions the
 * next frame has already superseded.
 */
export function graphOrbitOption(panel: Graph3dPanel, c: Palette, animate: boolean, positions: Float32Array): EChartsCoreOption {
  const data = graphOrbitData(panel, c, positions)
  const name = (params: { data?: { name?: string } }): string => params.data?.name ?? ""
  return {
    backgroundColor: "transparent",
    textStyle: { color: c.text, fontFamily: FONT },
    animation: false,
    tooltip: { trigger: "item", confine: true, formatter: graphTooltip },
    xAxis3D: hiddenAxis(),
    yAxis3D: hiddenAxis(),
    zAxis3D: hiddenAxis(),
    grid3D: {
      // The coordinate system without any of its furniture: a knowledge graph has no axes to
      // read, and the box is only here to hold three dimensions to put entities in.
      show: false,
      boxWidth: ORBIT_BOX,
      boxHeight: ORBIT_BOX,
      boxDepth: ORBIT_BOX,
      environment: "none",
      axisPointer: { show: false },
      // Ambient turned well up beside the main light: the far side of a graph is half of it, and
      // a node in shadow on a dark panel is a node that is not there.
      light: { main: { intensity: 1.2, shadow: false, alpha: 30, beta: 40 }, ambient: { intensity: 0.6 } },
      viewControl: {
        projection: "perspective",
        autoRotate: animate && panel.rotate !== false,
        autoRotateSpeed: ORBIT_SPEED,
        // Not stopped for good by a drag: a wall nobody is standing at has to go back to turning.
        autoRotateAfterStill: 4,
        distance: ORBIT_DISTANCE,
        alpha: 18,
        beta: 25,
        damping: 0.85,
      },
    },
    series: [
      {
        // Edges first, so the entities are drawn over their own lines rather than under them.
        type: "line3D",
        coordinateSystem: "cartesian3D",
        animation: false,
        lineStyle: { width: 1.6 },
        // One polyline pretending to be many, so there is nothing on it worth hovering: the
        // tooltip belongs to the entities, and a vertex of the joining thread is not a fact.
        silent: true,
        data: data.edges,
      },
      {
        type: "scatter3D",
        coordinateSystem: "cartesian3D",
        animation: false,
        symbolSize: (value: number[]) => value[3],
        itemStyle: { opacity: 0.95 },
        label: {
          show: true,
          formatter: (params: { data?: { labelled?: boolean; name?: string } }) => (params.data?.labelled ? (params.data.name ?? "") : ""),
          color: c.text,
          fontSize: 11,
          fontFamily: FONT,
          distance: 4,
          backgroundColor: "transparent",
        },
        emphasis: { label: { show: true, formatter: name }, itemStyle: { opacity: 1 } },
        data: data.nodes,
      },
    ],
  }
}
