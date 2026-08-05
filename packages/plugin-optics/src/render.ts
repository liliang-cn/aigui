import { translate, type MessageBundle } from "@ai-gui/core"
import { focalPoints, imageOf, lensRays, mirrorRays, refract, type ImagingElement, type Point, type Ray } from "./optics"
import type { OpticsDefinition, OpticsOptions } from "./types"

const CONCLUSION: MessageBundle = {
  en: {
    real: "real", virtual: "virtual", inverted: "inverted", upright: "upright",
    enlarged: "enlarged", reduced: "reduced", sameSize: "same size",
    imageAt: "image at", magnification: "magnification", infinity: "the object is at the focus, so no image forms",
    tir: "total internal reflection — no light passes through", critical: "critical angle",
    refraction: "refraction angle", noCritical: "light passes into the denser medium and bends toward the normal",
  },
  "zh-CN": {
    real: "实像", virtual: "虚像", inverted: "倒立", upright: "正立",
    enlarged: "放大", reduced: "缩小", sameSize: "等大",
    imageAt: "像距", magnification: "放大率", infinity: "物体位于焦点上，不成像",
    tir: "发生全反射，光线无法射出", critical: "临界角",
    refraction: "折射角", noCritical: "光进入光密介质，向法线偏折",
  },
}

/**
 * The sentence under the figure, written from the computed result.
 *
 * This is the part a model gets wrong — "倒立缩小实像" when it is upright and enlarged — and it is
 * the part a reader believes. Generated here it cannot disagree with the rays above it, and a
 * caption that says otherwise is visibly contradicted rather than quietly trusted.
 */
export function conclusionText(definition: OpticsDefinition, locale?: string): string {
  const t = (key: string) => translate(CONCLUSION, locale, key)
  if (definition.element === "interface") {
    const [n1, n2] = definition.media!
    const result = refract(n1, n2, definition.incidence!)
    if (result.totalInternalReflection) {
      return `${t("tir")}（${t("critical")} ${round(result.critical ?? 0)}°）`
    }
    const critical = result.critical === undefined ? "" : `，${t("critical")} ${round(result.critical)}°`
    return `${t("refraction")} ${round(result.refraction ?? 0)}°${critical}`
  }
  const { distance, height } = definition.object!
  const image = imageOf(definition.element as ImagingElement, definition.focal ?? 0, distance, height)
  if (image.atInfinity) return t("infinity")
  const size = Math.abs(image.magnification) > 1.0001 ? t("enlarged") : Math.abs(image.magnification) < 0.9999 ? t("reduced") : t("sameSize")
  const parts = [image.inverted ? t("inverted") : t("upright"), size, image.real ? t("real") : t("virtual")]
  const separator = locale?.startsWith("zh") ? "、" : ", "
  return `${parts.join(separator)}（${t("imageAt")} ${round(Math.abs(image.v))}，${t("magnification")} ${round(Math.abs(image.magnification))}）`
}

const round = (n: number): number => Math.round(n * 100) / 100

function palette(theme?: string) {
  return theme === "dark"
    ? { axis: "#52525b", text: "#d4d4d8", element: "#38bdf8", object: "#a3e635", image: "#f472b6", ray: "#fbbf24", normal: "#71717a" }
    : { axis: "#a1a1aa", text: "#3f3f46", element: "#0369a1", object: "#4d7c0f", image: "#be185d", ray: "#b45309", normal: "#a1a1aa" }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

interface Frame {
  cx: number
  cy: number
  scale: number
}

const px = (frame: Frame, p: Point): string => `${round(frame.cx + p.x * frame.scale)},${round(frame.cy - p.y * frame.scale)}`

function arrow(frame: Frame, from: Point, to: Point, colour: string, width = 2): string {
  const [x1, y1] = px(frame, from).split(",")
  const [x2, y2] = px(frame, to).split(",")
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="${width}" marker-end="url(#tip-${colour.slice(1)})"/>`
}

function polyline(frame: Frame, ray: Ray, colour: string): string {
  const points = ray.points.map((p) => px(frame, p)).join(" ")
  return `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="1.6"${ray.virtual ? ' stroke-dasharray="5 4"' : ""}/>`
}

/** Render one definition to a standalone SVG string. */
export function renderOpticsSVG(definition: OpticsDefinition, options: OpticsOptions = {}, theme?: string, locale?: string): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const colours = palette(theme)
  const parts: string[] = []
  const defs = [colours.ray, colours.object, colours.image]
    .map((c) => `<marker id="tip-${c.slice(1)}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c}"/></marker>`)
    .join("")

  if (definition.element === "interface") {
    const [n1, n2] = definition.media!
    const result = refract(n1, n2, definition.incidence!)
    const frame: Frame = { cx: width / 2, cy: height / 2, scale: 1 }
    const reach = Math.min(width, height) * 0.38
    const incidence = (definition.incidence! * Math.PI) / 180

    // The interface runs horizontally, the normal vertically: light arrives from the upper left.
    parts.push(`<line x1="20" y1="${height / 2}" x2="${width - 20}" y2="${height / 2}" stroke="${colours.element}" stroke-width="2"/>`)
    parts.push(`<line x1="${width / 2}" y1="${height / 2 - reach - 20}" x2="${width / 2}" y2="${height / 2 + reach + 20}" stroke="${colours.normal}" stroke-width="1" stroke-dasharray="5 4"/>`)
    const start: Point = { x: -reach * Math.sin(incidence), y: reach * Math.cos(incidence) }
    parts.push(arrow(frame, start, { x: 0, y: 0 }, colours.ray))
    if (result.totalInternalReflection) {
      const out: Point = { x: reach * Math.sin(incidence), y: reach * Math.cos(incidence) }
      parts.push(arrow(frame, { x: 0, y: 0 }, out, colours.ray))
    } else {
      const r = (result.refraction! * Math.PI) / 180
      parts.push(arrow(frame, { x: 0, y: 0 }, { x: reach * Math.sin(r), y: -reach * Math.cos(r) }, colours.ray))
    }
    parts.push(`<text x="24" y="${height / 2 - 10}" fill="${colours.text}" font-size="12">n₁ = ${n1}</text>`)
    parts.push(`<text x="24" y="${height / 2 + 20}" fill="${colours.text}" font-size="12">n₂ = ${n2}</text>`)
    parts.push(`<text x="${width / 2 + 8}" y="${height / 2 - reach - 6}" fill="${colours.text}" font-size="11">${escapeHtml(`${definition.incidence}°`)}</text>`)
  } else {
    const element = definition.element as ImagingElement
    const { distance, height: objectHeight } = definition.object!
    const focal = definition.focal ?? 0
    const image = imageOf(element, focal, distance, objectHeight)
    const foci = focalPoints(element, focal)

    // One scale for both axes so angles are true, chosen to fit the whole figure with a margin.
    const reachX = Math.max(distance, Math.abs(image.atInfinity ? distance : image.x), Math.abs(focal) * 2, 1) * 1.25
    const reachY = Math.max(objectHeight, Math.abs(image.atInfinity ? objectHeight : image.height), 1) * 1.6
    const scale = Math.min((width - 60) / (2 * reachX), (height - 60) / (2 * reachY))
    const frame: Frame = { cx: width / 2, cy: height / 2, scale }
    // Rays stop just past whatever the figure is about. Extended to the edge of the canvas they
    // become the longest strokes on it, and a reader's eye follows the longest stroke.
    const span = Math.min(
      Math.max(distance, Math.abs(image.atInfinity ? distance : image.x)) * 1.3,
      (width / 2 - 20) / scale,
    )

    parts.push(`<line x1="20" y1="${height / 2}" x2="${width - 20}" y2="${height / 2}" stroke="${colours.axis}" stroke-width="1"/>`)

    // The element itself.
    const halfHeight = Math.min(reachY * scale * 0.9, height / 2 - 24)
    if (element === "convex-lens" || element === "concave-lens") {
      const bulge = element === "convex-lens" ? 10 : -10
      parts.push(`<path d="M ${width / 2} ${height / 2 - halfHeight} Q ${width / 2 + bulge} ${height / 2} ${width / 2} ${height / 2 + halfHeight} Q ${width / 2 - bulge} ${height / 2} ${width / 2} ${height / 2 - halfHeight} Z" fill="${colours.element}" fill-opacity="0.14" stroke="${colours.element}" stroke-width="2"/>`)
    } else if (element === "plane-mirror") {
      parts.push(`<line x1="${width / 2}" y1="${height / 2 - halfHeight}" x2="${width / 2}" y2="${height / 2 + halfHeight}" stroke="${colours.element}" stroke-width="3"/>`)
    } else {
      const bulge = element === "concave-mirror" ? -14 : 14
      parts.push(`<path d="M ${width / 2} ${height / 2 - halfHeight} Q ${width / 2 + bulge} ${height / 2} ${width / 2} ${height / 2 + halfHeight}" fill="none" stroke="${colours.element}" stroke-width="3"/>`)
    }

    if (foci && (!definition.show || definition.show.includes("focalPoints"))) {
      const mirror = element === "concave-mirror" || element === "convex-mirror"
      const marks: Array<[number, string]> = mirror
        ? [[foci.near, "F"], [foci.near * 2, "2F"]]
        : [[foci.near, "F"], [foci.far, "F'"], [foci.near * 2, "2F"], [foci.far * 2, "2F'"]]
      for (const [x, name] of marks) {
        if (Math.abs(x) > span) continue
        const cx = frame.cx + x * scale
        parts.push(`<circle cx="${round(cx)}" cy="${height / 2}" r="2.5" fill="${colours.axis}"/>`)
        parts.push(`<text x="${round(cx)}" y="${height / 2 + 16}" fill="${colours.text}" font-size="11" text-anchor="middle">${name}</text>`)
      }
    }

    if (!definition.show || definition.show.includes("rays")) {
      const rays = element === "plane-mirror"
        ? planeMirrorRays(distance, objectHeight, span)
        : element === "concave-mirror" || element === "convex-mirror"
          ? mirrorRays(focal, distance, objectHeight, image, span)
          : lensRays(focal, distance, objectHeight, image, span)
      for (const ray of rays) parts.push(polyline(frame, ray, colours.ray))
    }

    parts.push(arrow(frame, { x: -distance, y: 0 }, { x: -distance, y: objectHeight }, colours.object, 2.5))
    if (!image.atInfinity) {
      parts.push(arrow(frame, { x: image.x, y: 0 }, { x: image.x, y: image.height }, colours.image, 2.5))
    }
    if (!definition.show || definition.show.includes("labels")) {
      const objectLabel = definition.object?.label ?? "AB"
      parts.push(`<text x="${round(frame.cx - distance * scale)}" y="${round(frame.cy - objectHeight * scale - 8)}" fill="${colours.object}" font-size="12" text-anchor="middle">${escapeHtml(objectLabel)}</text>`)
      if (!image.atInfinity) {
        const y = frame.cy - image.height * scale + (image.height >= 0 ? -8 : 16)
        parts.push(`<text x="${round(frame.cx + image.x * scale)}" y="${round(y)}" fill="${colours.image}" font-size="12" text-anchor="middle">${escapeHtml(`${objectLabel}'`)}</text>`)
      }
    }
  }

  const described = conclusionText(definition, locale)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"`,
    ` role="img" aria-label="${escapeHtml(described)}" data-aigui-optics="${definition.element}">`,
    `<defs>${defs}</defs>`,
    parts.join(""),
    "</svg>",
  ].join("")
}

/** A plane mirror reflects about its own plane: the image sits as far behind as the object is in front. */
function planeMirrorRays(distance: number, height: number, span: number): Ray[] {
  const top: Point = { x: -distance, y: height }
  const imageTop: Point = { x: distance, y: height }
  const hit: Point = { x: 0, y: height * 0.45 }
  // Reflection off a vertical mirror flips the horizontal component and keeps the vertical one.
  // The outgoing ray is cut short: continued to the edge of the canvas it is the longest line in
  // the figure and pulls the eye away from the object and its image.
  const reach = Math.min(span, distance * 1.1)
  const slope = (hit.y - top.y) / distance
  return [
    { points: [top, hit, { x: -reach, y: hit.y - slope * reach }] },
    { points: [hit, imageTop], virtual: true },
    { points: [top, { x: 0, y: height }, { x: -reach, y: height }] },
    { points: [{ x: 0, y: height }, imageTop], virtual: true },
  ]
}
