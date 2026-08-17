import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { PLUGIN_ID, TOOL_NAME } from "./constants"

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../openclaw.plugin.json", import.meta.url)), "utf8"),
) as {
  id: string
  contracts: { tools: string[] }
  toolMetadata: Record<string, { optional?: boolean }>
  configSchema: { properties: Record<string, unknown>; additionalProperties: boolean }
}

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
