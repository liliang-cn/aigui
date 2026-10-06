import { expect, test } from 'claude-code/testing'

import { drawnBy, fit, parseBmp, pathsIn, quadrants } from '../hooks/picture'

/** A 24-bit top-down BMP as sips writes it, from rows of [r, g, b] pixels. */
function bmp(rows: number[][][]): Uint8Array {
  const width = rows[0]?.length ?? 0
  const stride = Math.ceil((width * 24) / 32) * 4
  const bytes = new Uint8Array(54 + stride * rows.length)
  const view = new DataView(bytes.buffer)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, -rows.length, true)
  view.setUint16(28, 24, true)
  rows.forEach((row, y) => row.forEach(([r, g, b], x) => bytes.set([b ?? 0, g ?? 0, r ?? 0], 54 + y * stride + x * 3)))
  return bytes
}

const RED = [255, 0, 0]
const BLUE = [0, 0, 255]
const PNG = '/Users/me/.cache/aigui/images/chart-1.png'
const SUMMARY = `Drew 1 picture:\n- chart: ${PNG} (1200×800)\n  ! two labels overlap`
const PANE = {
  component: 'Pane',
  requestId: 'img-view',
  props: { title: 'Pictures', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4/58BAAT/Af9jgNErAAAAAElFTkSuQmCC'

test('a BMP decodes top row first, and each 2×2 pixels become one quadrant cell', async () => {
  const pixels = parseBmp(bmp([[RED, BLUE], [BLUE, RED]]))
  expect([pixels.width, pixels.height, ...pixels.rgba.slice(0, 8)]).toEqual([2, 2, 255, 0, 0, 255, 0, 0, 255, 255])

  // A red-blue checker splits exactly along its diagonal: ▞ in blue over red.
  const drawn = quadrants(pixels)
  const words = new Uint32Array(Uint8Array.fromBase64(drawn.cells).buffer)
  expect([drawn.columns, drawn.rows]).toEqual([1, 1])
  expect([...words]).toEqual([0x259e, 0x0000ff, 0xff0000])

  // One colour fills the cell; a left-right edge is ▌.
  const flat = new Uint32Array(Uint8Array.fromBase64(quadrants(parseBmp(bmp([[RED, RED], [RED, RED]]))).cells).buffer)
  expect([...flat]).toEqual([0x2588, 0xff0000, 0xff0000])
  const edge = new Uint32Array(Uint8Array.fromBase64(quadrants(parseBmp(bmp([[RED, BLUE], [RED, BLUE]]))).cells).buffer)
  expect([edge[0], edge[1], edge[2]]).toEqual([0x2590, 0x0000ff, 0xff0000])
})

test('the box keeps the picture its shape', async () => {
  expect(fit(1200, 800, { columns: 80, rows: 100 })).toEqual({ columns: 80, rows: 27 })
  expect(fit(400, 1600, { columns: 80, rows: 20 })).toEqual({ columns: 10, rows: 20 })
})

test('AIGUI drawings and other tools’ image paths are read out of the text', async () => {
  expect(drawnBy(SUMMARY)).toEqual([{ label: 'chart', path: PNG, width: 1200, height: 800, issues: 1 }])
  expect(pathsIn('Saved /tmp/x.png and /tmp/y.JPG, not /tmp/z.txt')).toEqual(['/tmp/x.png', '/tmp/y.JPG'])
})

for (const program of ['ghostty', 'Otty'] as const) {
  test(`an AIGUI drawing shows in the pane on ${program}`, async ($, on) => {
    on('env.get', ($, e) => ({ value: e.name === 'TERM_PROGRAM' ? program : e.name === 'TMPDIR' ? '/tmp/' : undefined }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.status', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('fs.read', ($, e) => ({ value: { base64: e.path.endsWith('.bmp') ? bmp([[RED, BLUE], [BLUE, RED]]).toBase64() : ONE_PIXEL_PNG } }))
    on('tool.call', () => ({ result: { content: [] }, text: SUMMARY }))

    await $.tool.call({ tool: 'mcp__plugin_aigui_aigui__aigui_render', markdown: '```chart\n{}\n```' })
    const ui = await $.ui.mount({ plugin: 'img-view', surface: 'terminal', ...PANE })
    expect(await ui.find({ type: program === 'ghostty' ? 'Image' : 'Raster' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 problem found/ })).toBeDefined()
  })
}

test('a Read of an image file shows it; a Bash call does not', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('fs.read', () => ({ value: { base64: ONE_PIXEL_PNG } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'pixelWidth: 10\npixelHeight: 5', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: {}, text: '' }))
  await $.tool.call({ tool: 'Bash', command: 'ls *.png' })
  const empty = await $.ui.mount({ plugin: 'img-view', surface: 'desktop', ...PANE })
  expect(await empty.find({ type: 'Text', text: /No pictures yet/ })).toBeDefined()
  await empty.unmount()

  await $.tool.call({ tool: 'Read', file_path: '/tmp/shot.png' })
  const desk = await $.ui.mount({ plugin: 'img-view', surface: 'desktop', ...PANE })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
})
