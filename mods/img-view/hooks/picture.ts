// What turns a picture into something a pane can hold, kept free of `$` so tests reach it.

import type { Picture } from '../types'

export const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i

/** Uncompressed pixels, top row first, 4 bytes each (r, g, b, a). */
export type Pixels = { width: number; height: number; rgba: Uint8Array }

/**
 * A BMP as `sips -s format bmp` and `magick … bmp3:` write it: BITMAPINFOHEADER or later,
 * 24 or 32 bits a pixel, uncompressed or bit-field masks, rows bottom-up or top-down.
 */
export function parseBmp(bytes: Uint8Array): Pixels {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('not a BMP')
  const offset = view.getUint32(10, true)
  const header = view.getUint32(14, true)
  const width = view.getInt32(18, true)
  const signed = view.getInt32(22, true)
  const bits = view.getUint16(28, true)
  const compression = view.getUint32(30, true)
  if (bits !== 24 && bits !== 32) throw new Error(`${bits}-bit BMP`)
  if (compression !== 0 && compression !== 3) throw new Error('compressed BMP')
  const height = Math.abs(signed)
  const isTopDown = signed < 0
  // Bit-field masks follow a 40-byte header (compression 3) or sit inside a longer one.
  const masks = compression === 3 && header >= 40
    ? [0, 1, 2, 3].map(i => (header >= 56 || i < 3 ? view.getUint32(54 + i * 4, true) : 0))
    : bits === 32 ? [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000] : [0, 0, 0, 0]
  const stride = Math.ceil((width * bits) / 32) * 4
  const rgba = new Uint8Array(width * height * 4)
  const channel = (value: number, mask: number) => {
    if (mask === 0) return 255
    let shift = 0
    while (((mask >>> shift) & 1) === 0) shift += 1
    return Math.round((((value & mask) >>> shift) * 255) / (mask >>> shift))
  }
  for (let y = 0; y < height; y += 1) {
    const row = offset + (isTopDown ? y : height - 1 - y) * stride
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      if (bits === 24) {
        const p = row + x * 3
        rgba[at] = bytes[p + 2] ?? 0
        rgba[at + 1] = bytes[p + 1] ?? 0
        rgba[at + 2] = bytes[p] ?? 0
        rgba[at + 3] = 255
      } else {
        const value = view.getUint32(row + x * 4, true)
        rgba[at] = channel(value, masks[0] ?? 0)
        rgba[at + 1] = channel(value, masks[1] ?? 0)
        rgba[at + 2] = channel(value, masks[2] ?? 0)
        rgba[at + 3] = masks[3] ? channel(value, masks[3]) : 255
      }
    }
  }
  return { width, height, rgba }
}

const DEFAULT = 0x01000000
const FULL = 0x2588

// The glyph that inks the quarters a mask names in the foreground: bit 8 top-left,
// 4 top-right, 2 bottom-left, 1 bottom-right. Every one is a width-1 BMP character.
const QUADRANTS = [
  FULL, 0x2597, 0x2596, 0x2584, 0x259d, 0x2590, 0x259e, 0x259f,
  0x2598, 0x259a, 0x258c, 0x2599, 0x2580, 0x259c, 0x259b, FULL,
]

/**
 * Two by two pixels a cell, the way chafa draws without a graphics protocol: of the
 * fourteen ways to split a cell's four pixels into two groups, the one whose two average
 * colours sit closest to the pixels, drawn as the quadrant glyph of that split. A pixel
 * under half opaque is left to the terminal's own background.
 */
export function quadrants(pixels: Pixels): { cells: string; columns: number; rows: number } {
  const columns = Math.ceil(pixels.width / 2)
  const rows = Math.ceil(pixels.height / 2)
  const words = new Uint32Array(columns * rows * 3)
  const quad = [0, 0, 0, 0].map(() => [0, 0, 0, 0])
  const read = (x: number, y: number, into: number[]) => {
    const cx = Math.min(x, pixels.width - 1)
    const cy = Math.min(y, pixels.height - 1)
    const at = (cy * pixels.width + cx) * 4
    into[0] = pixels.rgba[at] ?? 0
    into[1] = pixels.rgba[at + 1] ?? 0
    into[2] = pixels.rgba[at + 2] ?? 0
    into[3] = pixels.rgba[at + 3] ?? 0
  }
  const pack = (r: number, g: number, b: number) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      // Quarters in mask order: top-left, top-right, bottom-left, bottom-right.
      read(column * 2, row * 2, quad[0] as number[])
      read(column * 2 + 1, row * 2, quad[1] as number[])
      read(column * 2, row * 2 + 1, quad[2] as number[])
      read(column * 2 + 1, row * 2 + 1, quad[3] as number[])
      const at = (row * columns + column) * 3
      const opaque = quad.map(q => (q[3] ?? 0) >= 128)
      if (!opaque.every(Boolean)) {
        // Part see-through: ink the opaque quarters in their average, the rest left bare.
        const ink = quad.filter((_, i) => opaque[i])
        const mask = opaque.reduce((m, o, i) => (o ? m | (8 >> i) : m), 0)
        const avg = (c: number) => ink.reduce((sum, q) => sum + (q[c] ?? 0), 0) / Math.max(1, ink.length)
        words[at] = mask === 0 ? FULL : (QUADRANTS[mask] ?? FULL)
        words[at + 1] = mask === 0 ? DEFAULT : pack(avg(0), avg(1), avg(2))
        words[at + 2] = DEFAULT
        continue
      }
      let best = { error: Infinity, mask: 15, fg: 0, bg: 0 }
      for (let mask = 1; mask < 16; mask += 1) {
        const sums = [[0, 0, 0, 0], [0, 0, 0, 0]] as [number[], number[]]
        quad.forEach((q, i) => {
          const side = sums[(mask & (8 >> i)) ? 0 : 1]
          side[0] = (side[0] ?? 0) + (q[0] ?? 0)
          side[1] = (side[1] ?? 0) + (q[1] ?? 0)
          side[2] = (side[2] ?? 0) + (q[2] ?? 0)
          side[3] = (side[3] ?? 0) + 1
        })
        const mean = sums.map(s => [0, 1, 2].map(c => (s[c] ?? 0) / Math.max(1, s[3] ?? 0)))
        let error = 0
        quad.forEach((q, i) => {
          const m = mean[(mask & (8 >> i)) ? 0 : 1] as number[]
          for (let c = 0; c < 3; c += 1) error += ((q[c] ?? 0) - (m[c] ?? 0)) ** 2
        })
        if (error < best.error) {
          const [f, b] = mean as [number[], number[]]
          best = { error, mask, fg: pack(f[0] ?? 0, f[1] ?? 0, f[2] ?? 0), bg: pack(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0) }
        }
      }
      // One colour after all: a full block, which no font leaves a seam in.
      const isFlat = best.mask === 15 || best.fg === best.bg
      words[at] = isFlat ? FULL : (QUADRANTS[best.mask] ?? FULL)
      words[at + 1] = best.fg
      words[at + 2] = isFlat ? best.fg : best.bg
    }
  }
  return { cells: new Uint8Array(words.buffer).toBase64(), columns, rows }
}

/**
 * The box a w×h picture takes: as wide as the room allows, a cell being about twice as
 * tall as it is wide, shrunk to the room's height when that runs out first.
 */
export function fit(width: number, height: number, room: { columns: number; rows: number }) {
  let columns = Math.min(room.columns, 160)
  let rows = Math.round((columns * height) / width / 2)
  if (rows > room.rows) {
    rows = room.rows
    columns = Math.round((rows * 2 * width) / height)
  }
  return { columns: Math.max(1, Math.min(columns, 255)), rows: Math.max(1, Math.min(rows, 255)) }
}

// aigui_render's summary names each picture on its own line, its problems indented under it:
//   - chart: /Users/me/.cache/aigui/images/chart-1a2b.png (1200×800)
//     ! two labels overlap
const DRAWN = /^- ([\w-]+): (\/.+\.png) \((\d+)×(\d+)\)$/

export function drawnBy(text: string): Picture[] {
  const found: Picture[] = []
  for (const line of text.split('\n')) {
    const hit = DRAWN.exec(line)
    const last = found[found.length - 1]
    if (hit) found.push({ label: hit[1] ?? 'aigui', path: hit[2] ?? '', width: Number(hit[3]), height: Number(hit[4]), issues: 0 })
    else if (line.startsWith('  ! ') && last) last.issues += 1
  }
  return found
}

/** `Saved /path/x.png` and the like: every absolute image path a tool's text names. */
export function pathsIn(text: string): string[] {
  const found = text.match(/\/[^\s'"`()<>]+\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic)\b/gi) ?? []
  return [...new Set(found)]
}
