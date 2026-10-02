import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * A block someone added themselves: a folder with a manifest, a browser script and the rules a
 * model follows to write it.
 *
 * The script is a plain classic script — no build step — that registers its plugins the way the
 * page viewer's own packs do: `(globalThis.__aiguiPacks ??= {})[name] = (theme, still) => [...]`.
 * It runs only in pages and pictures drawn on this machine, from a folder the user put it in;
 * nothing is ever fetched from anywhere else.
 */
export interface CustomPlugin {
  name: string
  /** The fence names it draws, e.g. ["ticket"]. */
  fences: string[]
  /** One line for the block listing. */
  description: string
  /** Whether it can be drawn as a PNG (it draws without needing a person to interact). */
  picture: boolean
  /** The rules for the model — what aigui_guide returns for it. */
  spec: string
  /** Absolute path of the browser script. */
  script: string
  /** A short hash of the script, so a changed script is never served from a stale copy. */
  hash: string
}

export interface CustomManifest {
  name: string
  fences: string[]
  description: string
  picture?: boolean
  script?: string
  spec?: string
}

const NAME = /^[a-z][a-z0-9-]{1,31}$/

/** Where custom blocks live: `AIGUI_PLUGIN_DIR`, else `~/.config/aigui/plugins` (XDG honoured). */
export function customPluginDir(env: Record<string, string | undefined> = process.env): string {
  if (env.AIGUI_PLUGIN_DIR) return env.AIGUI_PLUGIN_DIR
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "aigui", "plugins")
}

/**
 * Every custom block in `dir`, and a line for each folder that is not one — a bad manifest is
 * reported, not fatal: one broken folder must not take the built-in blocks down with it.
 */
export async function loadCustomPlugins(dir = customPluginDir(), reserved: readonly string[] = []): Promise<{ plugins: CustomPlugin[]; problems: string[] }> {
  const plugins: CustomPlugin[] = []
  const problems: string[] = []
  const entries = await readdir(dir).catch(() => [] as string[])
  const taken = new Set(reserved)
  for (const entry of entries.sort()) {
    const folder = join(dir, entry)
    if (!(await stat(folder).catch(() => undefined))?.isDirectory()) continue
    try {
      const manifest = JSON.parse(await readFile(join(folder, "aigui.json"), "utf8")) as Partial<CustomManifest>
      if (typeof manifest.name !== "string" || !NAME.test(manifest.name)) throw new Error("name must be lowercase letters, digits and dashes")
      if (!Array.isArray(manifest.fences) || manifest.fences.length === 0 || !manifest.fences.every((f) => typeof f === "string" && NAME.test(f))) throw new Error("fences must be a list of lowercase fence names")
      for (const fence of [manifest.name, ...manifest.fences]) {
        if (taken.has(fence)) throw new Error(`"${fence}" is already a block`)
      }
      if (typeof manifest.description !== "string" || !manifest.description.trim()) throw new Error("description is required")
      const script = join(folder, manifest.script ?? "plugin.js")
      const code = await readFile(script, "utf8").catch(() => {
        throw new Error(`${manifest.script ?? "plugin.js"} is missing`)
      })
      const spec = await readFile(join(folder, manifest.spec ?? "spec.md"), "utf8").catch(() => {
        throw new Error(`${manifest.spec ?? "spec.md"} is missing — it is what tells the model how to write the block`)
      })
      for (const fence of [manifest.name, ...manifest.fences]) taken.add(fence)
      plugins.push({
        name: manifest.name,
        fences: manifest.fences,
        description: manifest.description.trim(),
        picture: manifest.picture !== false,
        spec: spec.trim(),
        script,
        hash: createHash("sha256").update(code).digest("hex").slice(0, 10),
      })
    } catch (error) {
      problems.push(`${entry}: ${(error as Error).message}`)
    }
  }
  return { plugins, problems }
}

/** Write a working custom block to start from: it draws, it has rules, it is ready to edit. */
export async function scaffoldCustomPlugin(name: string, dir = customPluginDir()): Promise<string> {
  if (!NAME.test(name)) throw new Error("a block name is lowercase letters, digits and dashes, starting with a letter")
  const folder = join(dir, name)
  if (await stat(folder).catch(() => undefined)) throw new Error(`${folder} already exists`)
  await mkdir(folder, { recursive: true })
  const manifest: CustomManifest = { name, fences: [name], description: `A ${name} card: a title, a status and fields`, picture: true }
  await writeFile(join(folder, "aigui.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(
    join(folder, "spec.md"),
    `${name} blocks (fenced): \`\`\`${name} with a JSON object inside, for showing one ${name} as a card.

Fields: "title" (required), "status" (one of "open", "in progress", "done"), "fields" (an object of short label → value).
Use only values from the conversation; never invent ids or numbers.

Example:

\`\`\`${name}
{ "title": "Login fails on Safari", "status": "in progress", "fields": { "id": "#1234", "owner": "Mei", "priority": "high" } }
\`\`\`
`,
  )
  await writeFile(
    join(folder, "plugin.js"),
    `// The "${name}" block: a classic browser script, no build step. It registers a factory that
// returns AIGUI plugins — the same shape as @ai-gui/core's AIGuiPlugin.
;(globalThis.__aiguiPacks ??= {})[${JSON.stringify(name)}] = (theme) => {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
  const colours = { open: "#2563eb", "in progress": "#d97706", done: "#16a34a" }
  return [
    {
      name: ${JSON.stringify(name)},
      css: [
        "[data-aigui-${name}]{border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:10px;padding:12px 14px;margin:12px 0;max-width:520px;font-size:14px}",
        "[data-aigui-${name}] h4{margin:0 0 8px;font-size:16px}",
        "[data-aigui-${name}] .status{display:inline-block;color:#fff;border-radius:999px;padding:1px 8px;font-size:12px;margin-bottom:8px}",
        "[data-aigui-${name}] dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0}",
        "[data-aigui-${name}] dt{opacity:.65}",
      ].join(""),
      nodeRenderers: {
        ${JSON.stringify(name)}: (node) => {
          let data
          try {
            data = JSON.parse(node.content ?? "")
          } catch {
            return { kind: "html", html: "<div>${name}: not valid JSON</div>" }
          }
          const status = colours[data.status] ? \`<span class="status" style="background:\${colours[data.status]}">\${esc(data.status)}</span>\` : ""
          const fields = Object.entries(data.fields ?? {}).map(([k, v]) => \`<dt>\${esc(k)}</dt><dd>\${esc(v)}</dd>\`).join("")
          return { kind: "html", html: \`<div data-aigui-${name}><h4>\${esc(data.title)}</h4>\${status}<dl>\${fields}</dl></div>\` }
        },
      },
      // A half-streamed object is not a card yet.
      isBlockComplete: (_type, raw) => {
        try {
          JSON.parse(raw)
          return true
        } catch {
          return false
        }
      },
    },
  ]
}
`,
  )
  return folder
}
