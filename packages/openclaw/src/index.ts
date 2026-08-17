import { homedir } from "node:os"
import { join } from "node:path"
import { closeBrowser, renderMarkdownToImages } from "@ai-gui/image"
import { createReplyPayloadHook, type HookDeps } from "./hook"
import { createRenderTool } from "./tool"

export { createReplyPayloadHook } from "./hook"
export { createRenderTool } from "./tool"
export { resolveConfig } from "./config"
export type { AiguiPluginConfig } from "./config"
export { rewritePayload } from "./rewrite"

/** The id OpenClaw knows this plugin by. Must match `openclaw.plugin.json`. */
export const PLUGIN_ID = "ai-gui"

/** The agent tool this plugin registers. Must be declared in the manifest's `contracts.tools`. */
export const TOOL_NAME = "aigui_render"

/**
 * The shape of the runtime this plugin reaches into. Everything on it is treated as optional.
 *
 * This is deliberately a narrow structural subset of OpenClaw's real `OpenClawPluginApi`, not an
 * import of it: importing the real type would defeat the point of the dynamic SDK import below,
 * and would pull the whole SDK type graph into a package that must type-check without OpenClaw
 * installed. Verified against `openclaw@2026.7.1`'s shipped `.d.ts` (see below); its `registerTool`
 * and `on` methods match this shape, and its `runtime.state.resolveStateDir` / `runtime.media.resizeToJpeg`
 * are narrower than the plan originally guessed (see `outboundDir` and `makeShrink`).
 */
interface PluginApi {
  on: (name: string, handler: unknown, options?: { timeoutMs?: number }) => void
  registerTool: (tool: unknown, options?: { optional?: boolean }) => void
  runtime?: {
    /** `openclaw/dist/plugin-sdk/plugin-entry.d.ts`: `state.resolveStateDir: typeof resolveStateDir`. */
    state?: { resolveStateDir?: (env?: NodeJS.ProcessEnv) => string }
    /**
     * `openclaw/dist/media-services-*.d.ts`: `resizeToJpeg(params: ResizeToJpegParams): Promise<Buffer>`
     * where `ResizeToJpegParams = { buffer: Buffer; maxSide: number; quality: number; withoutEnlargement?: boolean }`.
     * (Not the two-argument `(buffer, { maxWidth })` shape the SDK's own docs example shows at
     * `docs/plugins/sdk-runtime.md:492` — that example is stale relative to the shipped type.)
     */
    media?: {
      resizeToJpeg?: (params: { buffer: Buffer; maxSide: number; quality: number; withoutEnlargement?: boolean }) => Promise<Buffer>
    }
  }
}

/**
 * Where the pictures go. OpenClaw owns `media/outbound`; this plugin owns a folder inside it.
 *
 * `api.runtime.state.resolveStateDir` is asked first: it is the runtime's own accessor for the
 * state directory (confirmed in the installed SDK's types and `docs/plugins/sdk-runtime.md`), and
 * it already understands `OPENCLAW_STATE_DIR` and the legacy `~/.clawdbot` migration. The manual
 * env-var-then-homedir fallback only matters on an OpenClaw version old enough to lack that
 * accessor entirely.
 */
function outboundDir(api: PluginApi): string {
  const state =
    api.runtime?.state?.resolveStateDir?.(process.env) ?? process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw")
  return join(state, "media", "outbound", "aigui")
}

/** Wraps the runtime's re-encoder, if this OpenClaw version has one. */
function makeShrink(api: PluginApi): HookDeps["shrink"] {
  const resize = api.runtime?.media?.resizeToJpeg
  if (!resize) return undefined
  return async (path: string) => {
    const { readFile, stat, writeFile } = await import("node:fs/promises")
    const info = await stat(path)
    // Under a megabyte every channel accepts it as-is; re-encoding would only lose quality.
    if (info.size < 1_000_000) return undefined
    const jpeg = await resize({ buffer: await readFile(path), maxSide: 1440, quality: 80 })
    const target = `${path}.jpg`
    await writeFile(target, jpeg)
    return target
  }
}

function deps(api: PluginApi): HookDeps {
  return {
    outDir: outboundDir(api),
    render: renderMarkdownToImages,
    warn: (message, error) => console.warn(`[ai-gui] ${message}`, error ?? ""),
    shrink: makeShrink(api),
  }
}

/**
 * Plain object matching `definePluginEntry(...)`'s return shape (`DefinedPluginEntry`:
 * `{ id, name, description, configSchema, register }`, with `configSchema` optional on the
 * loader-facing `OpenClawPluginDefinition` union OpenClaw actually accepts from a plugin entry
 * module — see `openclaw/dist/plugin-sdk/plugin-entry.d.ts`).
 *
 * The plan called `definePluginEntry({ ... })` directly, which needs a top-level
 * `await import("openclaw/plugin-sdk/plugin-entry")` to get the helper. tsdown's `cjs` output
 * rejects top-level await ("Top-level await is currently not supported with the 'cjs' output
 * format"), so this exports the object literal `definePluginEntry` would have produced instead.
 * Nothing in `register` needs anything from the `openclaw` package at all — the SDK import is
 * gone entirely rather than merely moved, which keeps a plain Node import of this module free of
 * any OpenClaw dependency, not just free of a top-level await.
 *
 * This also sidesteps a trap: `definePluginEntry` defaults an omitted `configSchema` to
 * `emptyPluginConfigSchema()`, whose `safeParse` rejects any non-empty config with
 * `"config must be empty"` (`openclaw/dist/config-schema-ByzWLagI.js:100-113`). Calling the helper
 * without explicitly passing a schema — the obvious way to write it — would make every operator
 * setting in `openclaw.json` get refused, with the plugin silently running on defaults. Omitting
 * `configSchema` here instead of calling the helper leaves it genuinely absent, which the loader
 * treats as "skip" (`openclaw/dist/schema-DRyO1XBt.js:3140`, `if (!plugin.configSchema) continue`)
 * rather than "empty". `openclaw.plugin.json` — required to declare `configSchema` regardless
 * (`openclaw/dist/plugins-authoring-command-DORDD8cF.js:119`) — stays the single source of config
 * truth. Do not wrap this export in `definePluginEntry` without passing an explicit `configSchema`
 * that mirrors the manifest; `manifest.test.ts` pins the absence of a runtime schema here.
 */
export default {
  id: "ai-gui",
  name: "AIGUI",
  description: "Renders charts, diagrams, math, tables, cards and dashboards as images for picture-only channels.",
  register(api: PluginApi) {
    const shared = deps(api)
    // Rendering can take seconds; the runner's default per-hook budget is shorter than that.
    api.on("reply_payload_sending", createReplyPayloadHook(shared), { timeoutMs: 60_000 })
    api.registerTool(createRenderTool(shared), { optional: true })
    // Without this a stopped gateway can leave a Chromium behind until its idle timer fires.
    api.on("gateway_stop", async () => {
      await closeBrowser()
    })
  },
}
