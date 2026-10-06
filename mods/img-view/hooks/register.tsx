import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Picture } from '../types'
import { IMAGE, drawnBy, fit, parseBmp, pathsIn, quadrants } from './picture'

const PANE = 'img-view'
const pictures = atom({ plugin: 'img-view', key: 'pictures' } as const, [])
const selected = atom({ plugin: 'img-view', key: 'selected' } as const, -1)

// Terminals that draw the kitty graphics protocol show the pixels themselves; the rest get
// half-blocks. IMG_VIEW=image or IMG_VIEW=blocks overrides the guess.
const GRAPHICAL = /^(iTerm\.app|WezTerm|ghostty|kitty)$/i

// The file's bytes and each size it was drawn at, kept for this load of the module.
const pngs = new Map<string, string>()
const blocks = new Map<string, { cells: string; columns: number; rows: number }>()
const sizes = new Map<string, { width: number; height: number }>()

async function hasPixels($: EngineInterface): Promise<boolean> {
  const forced = await $.env.get('IMG_VIEW')
  if (forced === 'image') return true
  if (forced === 'blocks') return false
  const program = (await $.env.get('TERM_PROGRAM')) ?? ''
  const term = (await $.env.get('TERM')) ?? ''
  return GRAPHICAL.test(program) || /kitty|ghostty/.test(term)
}

/** The picture's size in pixels, from the file itself (sips on macOS, ImageMagick elsewhere). */
async function sizeOf($: EngineInterface, path: string): Promise<{ width: number; height: number } | undefined> {
  const known = sizes.get(path)
  if (known) return known
  let width = 0
  let height = 0
  const sips = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path]).catch(() => undefined)
  if (sips?.exitCode === 0) {
    width = Number(/pixelWidth: (\d+)/.exec(sips.stdout)?.[1] ?? 0)
    height = Number(/pixelHeight: (\d+)/.exec(sips.stdout)?.[1] ?? 0)
  } else {
    const magick = await $.process.run(['magick', 'identify', '-format', '%w %h', `${path}[0]`]).catch(() => undefined)
    const [w, h] = (magick?.stdout ?? '').trim().split(' ').map(Number)
    width = w ?? 0
    height = h ?? 0
  }
  if (!width || !height) return undefined
  sizes.set(path, { width, height })
  return { width, height }
}

/** The picture scaled to exactly (columns·2) × (rows·2) pixels, as quadrant cells. */
async function blocksOf($: EngineInterface, path: string, columns: number, rows: number) {
  const key = `${path}|${columns}x${rows}`
  const known = blocks.get(key)
  if (known) return known
  const tmp = `${(await $.env.get('TMPDIR')) ?? '/tmp/'}img-view-${columns}x${rows}-${path.replace(/[^\w.-]/g, '_').slice(-80)}.bmp`
  const sips = await $.process.run(['sips', '-z', String(rows * 2), String(columns * 2), path, '-s', 'format', 'bmp', '--out', tmp]).catch(() => undefined)
  if (sips?.exitCode !== 0) {
    const magick = await $.process.run(['magick', `${path}[0]`, '-resize', `${columns * 2}x${rows * 2}!`, `bmp3:${tmp}`]).catch(() => undefined)
    if (magick?.exitCode !== 0) throw new Error('neither sips nor ImageMagick could read it')
  }
  const { base64 } = await $.fs.read(tmp, { as: 'bytes' })
  const drawn = quadrants(parseBmp(Uint8Array.fromBase64(base64)))
  blocks.set(key, drawn)
  return drawn
}

async function pngOf($: EngineInterface, path: string): Promise<string> {
  const known = pngs.get(path)
  if (known !== undefined) return known
  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  pngs.set(path, base64)
  return base64
}

async function show($: EngineInterface, found: Picture[]) {
  if (found.length === 0) return
  const list = await update($, pictures, old => [...old.filter(p => !found.some(f => f.path === p.path)), ...found].slice(-50))
  await update($, selected, () => list.length - found.length)
  $.ui.status(`${list.length} picture${list.length === 1 ? '' : 's'} — /img`)
  void $.ui.open({ id: PANE, title: 'Pictures' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'img', description: 'Show an image in the pictures pane: /img <path>, or no path for the pane' })
    return next(e)
  })

  on('command.run', { command: 'img' }, async ($, e) => {
    const path = e.args.trim().replace(/^~(?=\/)/, (await $.env.get('HOME')) ?? '~')
    if (path) {
      if (!(await $.fs.exists(path))) return { text: `No file at ${path}.` }
      await show($, [{ path, label: '/img', issues: 0 }])
      return { text: `Showing ${path}.` }
    }
    await $.ui.open({ id: PANE, title: 'Pictures' })
    return { text: 'Pictures pane opened.' }
  })

  // Pictures arrive from the tools that make or read them: AIGUI's drawings, an image file
  // the model reads or writes, and any absolute image path an AIGUI tool reports.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const input = e as unknown as { file_path?: unknown }
    const filePath = typeof input.file_path === 'string' ? input.file_path : ''
    if ((e.tool === 'Read' || e.tool === 'Write') && IMAGE.test(filePath)) {
      await show($, [{ path: filePath, label: e.tool, issues: 0 }])
    } else if (/aigui_/.test(e.tool) && ran.text) {
      const drawn = drawnBy(ran.text)
      const named = drawn.length ? drawn : pathsIn(ran.text).map(path => ({ path, label: 'aigui', issues: 0 }))
      await show($, named)
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, pictures)
    const at = Math.min(Math.max(await read($, selected), 0), list.length - 1)
    const picture = list[at]
    if (!picture) return <Text dimColor>No pictures yet. /img path shows one; AIGUI's drawings and image files Claude reads appear here.</Text>

    const name = picture.path.split('/').pop() ?? picture.path
    const alt = `${picture.label} — ${name}`
    const go = (step: number) => () => update($, selected, () => Math.min(Math.max(at + step, 0), list.length - 1))
    // The pane's own body, not the terminal: two rows go to the title line and the buttons.
    const room = {
      columns: Math.max(10, e.props.bodyColumns ?? (e.viewport?.columns ?? 80) - 2),
      rows: Math.max(4, (e.props.scroll?.bodyRows ?? (e.viewport?.rows ?? 30) - 4) - 2),
    }

    let body
    try {
      const size = picture.width && picture.height ? { width: picture.width, height: picture.height } : await sizeOf($, picture.path)
      if (!size) throw new Error('unknown size')
      const box = fit(size.width, size.height, room)
      if (e.surface === 'terminal') {
        const { Image, Raster } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
        if ((await hasPixels($)) && /\.png$/i.test(picture.path)) {
          body = <Image key="picture" source={{ png: await pngOf($, picture.path) }} columns={box.columns} rows={box.rows} alt={alt} />
        } else {
          const drawn = await blocksOf($, picture.path, box.columns, box.rows)
          body = <Raster key="picture" cells={drawn.cells} columns={drawn.columns} rows={drawn.rows} />
        }
      } else if ('Svg' in ui && /\.(png|jpe?g|gif|webp)$/i.test(picture.path)) {
        const { Svg } = ui as typeof ui & { Svg: (props: { source: string; alt: string }) => unknown }
        const kind = /\.png$/i.test(picture.path) ? 'png' : /\.gif$/i.test(picture.path) ? 'gif' : /\.webp$/i.test(picture.path) ? 'webp' : 'jpeg'
        const data = await pngOf($, picture.path)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}"><image width="${size.width}" height="${size.height}" href="data:image/${kind};base64,${data}"/></svg>`
        body = <Svg source={svg} alt={alt} />
      } else {
        body = <Text dimColor>{alt}</Text>
      }
    } catch (error) {
      body = <Text dimColor>{name}: {(await $.fs.exists(picture.path)) ? String((error as Error).message) : 'no longer on disk'}.</Text>
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{picture.label}</Text>
          <Text dimColor> {at + 1}/{list.length}  {name}</Text>
          {picture.issues > 0 && <Text color="yellow">  {picture.issues} problem{picture.issues === 1 ? '' : 's'} found</Text>}
        </Box>
        {body}
        <Box>
          <Button key="prev" hotkey="p" label="Previous" plain onPress={go(-1)} />
          <Text> </Text>
          <Button key="next" hotkey="n" label="Next" plain onPress={go(1)} />
          <Text> </Text>
          <Button key="open" hotkey="o" label="Open" plain onPress={() => $.process.run(['open', picture.path])} />
        </Box>
      </Box>
    )
  })
}
