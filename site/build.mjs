// Builds the landing page into site/dist: the page, its machine-readable files, the gallery
// pictures, and one self-contained interactive demo per block family — exported by AIGUI itself
// from the same blocks a model writes, so every demo is the real output.
//
//   pnpm build && node site/build.mjs
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { standalonePage, writePage } from "../packages/mcp/dist/index.js"
import { scenePromptSpec } from "../packages/plugin-scene/dist/index.js"
import { topologyPromptSpec } from "../packages/plugin-topology/dist/index.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const out = join(root, "site", "dist")
const BASE = "https://liliang-cn.github.io/aigui"
const today = new Date().toISOString().slice(0, 10)
const version = JSON.parse(await readFile(join(root, "packages/mcp/package.json"), "utf8")).version

const example = (spec, fence, find) => {
  // [0] is the prose before the first example — which may itself mention the fence name.
  const block = spec.split(`\`\`\`${fence}\n`).slice(1).find((b) => !find || b.includes(find))
  return `\`\`\`${fence}\n${block.slice(0, block.indexOf("```"))}\`\`\``
}

const DEMOS = [
  {
    slug: "topology",
    title: "Database failover, played step by step",
    markdown: `A topology the agent drew from a description of the system. Its steps play: the write reaches the primary, is replicated, the primary fails and the replica takes over.\n\n${example(topologyPromptSpec("en"), "topology")}`,
  },
  {
    slug: "scene",
    title: "A 3D scene with stacked, labelled objects",
    markdown: `Drag to turn it. Labels sit in columns beside the scene, joined by leaders that bend round other objects.\n\n\`\`\`scene\n${await readFile(join(root, "packages/plugin-scene/src/fixtures/regression/stacked-labels.json"), "utf8")}\n\`\`\`\n\nA scene with steps — a failed disk swapped out:\n\n${example(scenePromptSpec("en"), "scene", '"steps"')}`,
  },
  {
    slug: "dashboard",
    title: "An operations wall (sample data)",
    markdown: '```bigscreen\n{"title":"Operations (sample data)","theme":"dark","panels":[{"kind":"kpi","title":"Orders today","value":12843,"delta":0.12,"span":3},{"kind":"kpi","title":"Revenue","value":2860000,"prefix":"$","delta":0.08,"span":3},{"kind":"kpi","title":"Conversion","value":3.42,"unit":"%","delta":-0.02,"span":3},{"kind":"gauge","title":"Target","value":76,"unit":"%","span":3},{"kind":"chart","title":"Orders, last 7 days","span":8,"option":{"xAxis":{"type":"category","data":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},"yAxis":{"type":"value"},"series":[{"type":"line","smooth":true,"areaStyle":{},"data":[820,932,901,934,1290,1330,1320]}]}},{"kind":"rank","title":"Top regions","span":4,"items":[{"name":"North","value":3200},{"name":"East","value":2900},{"name":"West","value":2400},{"name":"South","value":1900},{"name":"Central","value":1500}]}]}\n```',
  },
  {
    slug: "molecule",
    title: "Caffeine in 3D, from SMILES",
    markdown: 'The agent writes only the SMILES string; the 3D structure is computed and relaxed with a force field.\n\n```molecule\n{"version":1,"format":"smiles","source":"Cn1cnc2c1c(=O)n(C)c(=O)n2C","view":"3d","style":"ball-and-stick"}\n```',
  },
  {
    slug: "orbits",
    title: "Earth and Mars, integrated from masses and distances",
    markdown: '```gravity\n{"units":"astronomical","bodies":[{"id":"Sun","mass":1},{"id":"Earth","mass":3e-6,"orbit":{"around":"Sun","distance":1}},{"id":"Mars","mass":3.2e-7,"orbit":{"around":"Sun","distance":1.52}}],"duration":2,"caption":"Two years, integrated rather than drawn"}\n```',
  },
  {
    slug: "chart",
    title: "Charts, diagrams and maths",
    markdown: '```chart\n{"title":{"text":"Quarterly revenue (sample data)"},"tooltip":{"trigger":"axis"},"legend":{"bottom":0},"xAxis":{"type":"category","data":["Q1","Q2","Q3","Q4"]},"yAxis":{"type":"value"},"series":[{"name":"2025","type":"bar","data":[120,132,101,134]},{"name":"2026","type":"bar","data":[150,168,142,190]}]}\n```\n\n```mermaid\nsequenceDiagram\n  participant U as You\n  participant A as Agent\n  participant S as AIGUI\n  U->>A: How does failover work here?\n  A->>S: a topology block\n  S-->>A: the picture, checked\n  A-->>U: answer + live page\n```\n\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$',
  },
]

await rm(out, { recursive: true, force: true })
await mkdir(join(out, "demos"), { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), "aigui-site-"))
process.env.AIGUI_NO_OPEN = "1"
for (const demo of DEMOS) {
  const page = await writePage(demo.markdown, { title: demo.title, outDir: scratch, open: false, theme: "light" })
  const html = await readFile(await standalonePage(page.path), "utf8")
  // The site's icon on every demo too: a demo is often the page someone keeps a tab open on.
  const icons = '<link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="icon" href="../favicon-32.png" type="image/png" sizes="32x32">'
  await writeFile(join(out, "demos", `${demo.slug}.html`), html.replace("<title>", `${icons}\n<title>`))
  console.log(`demo ${demo.slug}`)
}

await cp(join(root, "docs", "images"), join(out, "images"), { recursive: true })
for (const icon of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-512.png"]) await copyFile(join(root, "site", icon), join(out, icon))
for (const file of ["index.html", "robots.txt", "llms.txt"]) {
  const text = await readFile(join(root, "site", file), "utf8")
  await writeFile(join(out, file), text.replaceAll("{{VERSION}}", version).replaceAll("{{UPDATED}}", today))
}
const urls = ["/", ...DEMOS.map((d) => `/demos/${d.slug}.html`), "/llms.txt"]
await writeFile(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${BASE}${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`,
)
await rm(scratch, { recursive: true, force: true })
console.log(`site/dist ready (v${version}, ${today})`)
