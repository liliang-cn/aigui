import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PLUGIN_ID, TOOL_NAME } from "./constants"
import entry from "./index"

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../openclaw.plugin.json", import.meta.url)), "utf8"),
) as {
  id: string
  activation?: { onStartup?: boolean }
  contracts: { tools: string[] }
  toolMetadata: Record<string, { optional?: boolean }>
  configSchema: { properties: Record<string, unknown>; additionalProperties: boolean }
}

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as {
  openclaw: { extensions: unknown }
  files: string[]
  dependencies: Record<string, string>
  peerDependencies?: Record<string, string>
}

describe("package.json", () => {
  /**
   * `openclaw plugins install` rejects a bare string with "openclaw.extensions must be an array",
   * and nothing before the gateway install says so — not the build, not publint, not a typecheck.
   */
  it("declares the runtime entrypoint as an array", () => {
    expect(Array.isArray(pkg.openclaw.extensions)).toBe(true)
    expect(pkg.openclaw.extensions).toEqual(["./dist/index.js"])
  })

  it("ships the manifest, or OpenClaw cannot validate config without loading code", () => {
    expect(pkg.files).toContain("openclaw.plugin.json")
  })

  /**
   * OpenClaw installs a plugin with `npm install --omit=dev --ignore-scripts` and deliberately
   * skips peer resolution. A peer-declared Playwright therefore never lands, and the plugin
   * installs cleanly then silently renders nothing — every reply degrading through
   * `BrowserUnavailableError`. Drawing is this plugin's whole purpose, so it is a real dependency.
   */
  it("declares Playwright as a runtime dependency, not a peer", () => {
    expect(pkg.dependencies).toHaveProperty("playwright")
    expect(pkg.peerDependencies ?? {}).not.toHaveProperty("playwright")
  })

  /**
   * The host package is the one peer that stays a peer: OpenClaw refuses to let npm pull a second
   * registry copy of itself into a plugin, and relinks `node_modules/openclaw` after install.
   */
  it("keeps the host as an optional peer", () => {
    expect(pkg.peerDependencies).toHaveProperty("openclaw")
  })

  /**
   * The manifest must not restate the version. `changeset version` bumps package.json and nothing
   * else, so a hand-written copy here silently rots: v0.31.0 shipped reporting 0.30.0 to
   * `openclaw plugins inspect`. The field is optional, and OpenClaw reads the package version.
   */
  it("does not duplicate the version the release process owns", () => {
    expect(manifest).not.toHaveProperty("version")
  })
})

describe("openclaw.plugin.json", () => {
  it("declares the id the code uses", () => {
    expect(manifest.id).toBe(PLUGIN_ID)
  })

  /**
   * Without this the gateway loads the plugin but never activates it at startup, so `register`
   * runs only later in the agent runtime — and the hooks it adds there never reach the global
   * hook runner that `reply_payload_sending` dispatches through. The symptom is silent and
   * misleading: `openclaw plugins inspect` reports `status: loaded`, `activated: true` and
   * `hookCount: 2` (that is the CLI activating it in its own process), while every reply on the
   * real channel goes out with the fence intact and `mediaUrl=none`. Verified against
   * `openclaw@2026.7.1-2`, where all 67 stock manifests carry an explicit `activation`.
   */
  it("activates at startup, or the reply hook never reaches the global runner", () => {
    expect(manifest.activation?.onStartup).toBe(true)
  })

  it("declares the tool the code registers", () => {
    // A tool missing from contracts.tools is skipped at load time and reported as a diagnostic.
    expect(manifest.contracts.tools).toContain(TOOL_NAME)
  })

  it("keeps the tool opt-in", () => {
    expect(manifest.toolMetadata[TOOL_NAME]?.optional).toBe(true)
  })

  it("declares every config key the plugin reads", () => {
    // `additionalProperties: false` means an undeclared key fails the operator's whole config.
    expect(manifest.configSchema.additionalProperties).toBe(false)
    expect(Object.keys(manifest.configSchema.properties).sort()).toEqual([
      "blocks",
      "channels",
      "idleShutdownMs",
      "maxImages",
      "scale",
      "theme",
      "timeoutMs",
      "width",
    ])
  })
})

describe("plugin entry", () => {
  it("identifies itself with the manifest's id", () => {
    expect((entry as { id: string }).id).toBe(manifest.id)
  })

  /**
   * Wrapping this in `definePluginEntry` without an explicit schema would default it to
   * `emptyPluginConfigSchema`, which rejects any non-empty config outright. The manifest is where
   * the schema lives; a runtime schema here would only shadow it, and an empty one would break
   * every operator setting.
   */
  it("carries no runtime config schema, leaving the manifest authoritative", () => {
    expect("configSchema" in (entry as object)).toBe(false)
  })

  it("registers something", () => {
    expect(typeof (entry as { register: unknown }).register).toBe("function")
  })
})
