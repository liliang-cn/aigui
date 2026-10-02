import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { arch, platform, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import { afterAll, describe, expect, it } from "vitest"
import { closeBrowser } from "./browser"
import { renderMarkdownToImages } from "./render"

/**
 * Pictures compared with pictures known to be right.
 *
 * The other browser tests check that a block drew something; these check that it drew the same
 * thing as last time. A gauge reading slid onto its scale, badges shrunk to seven pixels, a label
 * on another label — each rendered without an error and passed every other test, and each would
 * have failed here.
 *
 * Goldens are per platform: fonts and antialiasing differ between Linux and macOS, so a picture is
 * only ever compared with one made on the same kind of machine. CI makes and checks the Linux ones
 * (`.github/workflows/visual-goldens.yml` regenerates them). A platform with no goldens is skipped,
 * not failed. `AIGUI_VISUAL_UPDATE=1` writes this platform's goldens instead of comparing.
 */
const here = dirname(fileURLToPath(import.meta.url))
const goldens = join(here, "..", "visual", `${platform()}-${arch()}`)
const update = process.env.AIGUI_VISUAL_UPDATE === "1"
const enabled = process.env.AIGUI_IMAGE_E2E === "1"

/** A changed pixel is one whose colour moved more than antialiasing moves it. */
const PIXEL_THRESHOLD = 0.12
/**
 * A picture fails when more than this share of it changed. Small on purpose: the same machine
 * draws a picture identically every time, and a gauge reading sliding onto its scale is 0.09%.
 */
const MAX_CHANGED = 0.0005

const CASES: Record<string, string> = {
  chart: '```chart\n{"title":{"text":"Quarterly revenue"},"legend":{"bottom":0},"xAxis":{"type":"category","data":["Q1","Q2","Q3","Q4"]},"yAxis":{"type":"value"},"series":[{"name":"2025","type":"bar","data":[120,132,101,134]},{"name":"2026","type":"bar","data":[150,168,142,190]}]}\n```',
  mermaid: "```mermaid\nsequenceDiagram\n  participant U as User\n  participant A as App\n  U->>A: question\n  A-->>U: answer\n```",
  math: "$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$",
  table: "| City | Temp |\n| --- | --- |\n| Tokyo | 24 |\n| Oslo | 9 |",
  topology: '```topology\n{"title":"Replication","groups":[{"id":"a","label":"node-a"},{"id":"b","label":"node-b"}],"nodes":[{"id":"app","kind":"client"},{"id":"p","label":"db","kind":"database","group":"a","state":"primary"},{"id":"r","label":"db","kind":"database","group":"b","state":"secondary"}],"links":[{"from":"app","to":"p","label":"writes"},{"id":"rep","from":"p","to":"r","label":"replication"}],"steps":[{"caption":"write","messages":[{"from":"app","to":"p"}]},{"caption":"fail","states":{"p":"failed"},"links":{"rep":"down"}}]}\n```',
  scene: '```scene\n{"objects":[{"shape":"box","size":[1.6,0.9,1.2],"position":[-1.5,0,0],"anchor":"bottom","color":"#64748b","label":"pool","labelSide":"left"},{"shape":"box","size":[1.6,0.9,1.2],"position":[-1.5,0.9,0],"anchor":"bottom","color":"#b45309","label":"replica","labelSide":"left"},{"shape":"cylinder","radius":0.5,"height":1.2,"position":[1.5,0,0],"anchor":"bottom","color":"#0ea5e9","label":"cache","labelSide":"right"}]}\n```',
  bigscreen: '```bigscreen\n{"title":"Operations","theme":"dark","panels":[{"kind":"kpi","title":"Orders","value":12843,"delta":0.12,"span":4},{"kind":"kpi","title":"Conversion","value":3.42,"unit":"%","span":4},{"kind":"gauge","title":"Target","value":76,"unit":"%","span":4},{"kind":"rank","title":"Regions","span":12,"items":[{"name":"North","value":3200},{"name":"East","value":2900},{"name":"West","value":2400}]}]}\n```',
  gravity: '```gravity\n{"units":"astronomical","bodies":[{"id":"Sun","mass":1},{"id":"Earth","mass":3e-6,"orbit":{"around":"Sun","distance":1}}],"duration":1}\n```',
}

afterAll(async () => {
  await closeBrowser()
})

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}

const haveGoldens = enabled && (update || (await exists(goldens)))

describe.skipIf(!haveGoldens)(`pictures match their goldens (${platform()}-${arch()})`, () => {
  it.each(Object.keys(CASES))("%s", async (name) => {
    const outDir = await mkdtemp(join(tmpdir(), "aigui-visual-"))
    const result = await renderMarkdownToImages(CASES[name], { outDir, timeoutMs: 40_000, width: 720, scale: 1 })
    expect(result.images).toHaveLength(1)
    const drawn = result.images[0].path
    const golden = join(goldens, `${name}.png`)
    if (update) {
      await mkdir(goldens, { recursive: true })
      await copyFile(drawn, golden)
      return
    }
    expect(await exists(golden), `no golden for ${name}; run with AIGUI_VISUAL_UPDATE=1`).toBe(true)
    const [a, b] = [PNG.sync.read(await readFile(golden)), PNG.sync.read(await readFile(drawn))]
    expect(`${b.width}×${b.height}`, `${name} changed size`).toBe(`${a.width}×${a.height}`)
    const diff = new PNG({ width: a.width, height: a.height })
    const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: PIXEL_THRESHOLD })
    const share = changed / (a.width * a.height)
    if (share > MAX_CHANGED) {
      // Left beside the drawing for whoever reads the failure: red where it moved.
      await writeFile(join(outDir, `${name}.diff.png`), PNG.sync.write(diff))
    }
    expect(share, `${name}: ${(share * 100).toFixed(2)}% of pixels changed — diff at ${join(outDir, `${name}.diff.png`)}`).toBeLessThanOrEqual(MAX_CHANGED)
  }, 90_000)
})
