import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PLUGIN_ID, TOOL_NAME } from "./constants"
import entry from "./index"

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../openclaw.plugin.json", import.meta.url)), "utf8"),
) as {
  id: string
  contracts: { tools: string[] }
  toolMetadata: Record<string, { optional?: boolean }>
  configSchema: { properties: Record<string, unknown>; additionalProperties: boolean }
}

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { openclaw: { extensions: unknown }; files: string[] }

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
})

describe("openclaw.plugin.json", () => {
  it("declares the id the code uses", () => {
    expect(manifest.id).toBe(PLUGIN_ID)
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
