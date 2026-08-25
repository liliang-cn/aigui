import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = fileURLToPath(new URL("..", import.meta.url))

/**
 * A prompt spec is a specification as far as a model is concerned, and its
 * examples are the part that gets copied.
 *
 * `` ```list {"items":[…]} ``` `` shipped in the primitives spec for months.
 * A model copied it exactly and the answer rendered as raw JSON running
 * through the middle of a sentence, because that line is not a fenced block
 * at all: CommonMark forbids backticks in a fence's info string, so it parses
 * as an inline code span. Nobody could see the mistake from the model's side —
 * it emitted precisely what it had been shown.
 *
 * So the examples are linted. Any file that describes blocks to a model must
 * show them the way the parser reads them: fence and name on one line, content
 * on the lines after, closing fence alone.
 */
const ONE_LINE_FENCE = /```[A-Za-z][\w-]*[ \t]+[^\n]*?```/g

/** Files that talk to models: every package's sources, minus their tests. */
function specSources(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`
      if (statSync(path).isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue
        walk(path)
        continue
      }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue
      // Tests are where the broken shape is written on purpose, to prove it is
      // recognised and rejected.
      if (entry.includes(".test.")) continue
      out.push(path)
    }
  }
  walk(`${root}packages`)
  return out
}

describe("prompt specs", () => {
  it("never show a block squeezed onto one line", () => {
    const offenders: string[] = []
    for (const path of specSources()) {
      const src = readFileSync(path, "utf8")
      // Only files that actually address a model. A fence inside a README-ish
      // comment about markdown is not guidance.
      if (!src.includes("promptSpec") && !src.includes("toPromptSpec") && !src.includes("MessageBundle")) continue
      for (const match of src.match(ONE_LINE_FENCE) ?? []) {
        offenders.push(`${path.slice(root.length)}: ${match.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("recognises the shape it is looking for", () => {
    const bad = '      "Primitive UI blocks (fenced): ```list {\\"items\\":[...]}```;"'
    const good = ['      "```list",', '      \'{"items":["a"]}\',', '      "```",'].join("\n")
    expect(bad.match(ONE_LINE_FENCE)).not.toBeNull()
    expect(good.match(ONE_LINE_FENCE)).toBeNull()
  })
})
