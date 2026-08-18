import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = fileURLToPath(new URL("..", import.meta.url))

function read(name: string): string {
  return readFileSync(`${root}${name}`, "utf8")
}

function publishedPackages(): string[] {
  return readdirSync(`${root}packages`)
    .map((dir) => {
      try {
        return JSON.parse(readFileSync(`${root}packages/${dir}/package.json`, "utf8")) as {
          name: string
          private?: boolean
        }
      } catch {
        return undefined
      }
    })
    .filter((manifest): manifest is { name: string; private?: boolean } => Boolean(manifest) && !manifest?.private)
    .map((manifest) => manifest.name)
}

describe("root docs", () => {
  /**
   * `@ai-gui/plugin-dashboard` shipped in a release and stayed missing from this list until
   * someone diffed the two by hand. Nothing else notices: the package builds, publishes and works,
   * and the only symptom is that a reader cannot find out it exists.
   */
  it("names every published package in the install section", () => {
    const install = read("README.md").split("## Quick start")[0]
    const missing = publishedPackages().filter((name) => !install.includes(name))
    expect(missing).toEqual([])
  })

  it("does not advertise a package that does not exist", () => {
    const published = new Set(publishedPackages())
    const advertised = new Set([...read("README.md").matchAll(/@ai-gui\/[a-z0-9-]+/g)].map((match) => match[0]))
    expect([...advertised].filter((name) => !published.has(name))).toEqual([])
  })

  it("keeps the skill's package references real too", () => {
    const published = new Set(publishedPackages())
    const advertised = new Set([...read("SKILL.md").matchAll(/@ai-gui\/[a-z0-9-]+/g)].map((match) => match[0]))
    expect([...advertised].filter((name) => !published.has(name))).toEqual([])
  })
})
