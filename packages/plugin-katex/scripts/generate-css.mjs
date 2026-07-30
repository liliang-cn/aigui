#!/usr/bin/env node
/**
 * Turn the installed KaTeX stylesheet into a TypeScript module.
 *
 * KaTeX's CSS points at `fonts/…` relative to its own file, which only resolves when a bundler
 * emits the stylesheet. A host without a build step cannot use it at all, so the font URLs are
 * replaced with a placeholder here and filled in at runtime by `katexInlineCss({ fontBase })`.
 *
 * Run with `pnpm --filter @ai-gui/plugin-katex generate:css`. The committed output is checked
 * against the installed KaTeX by `src/katex-css.test.ts`, so an upgrade that changes the
 * stylesheet fails the tests rather than shipping the old one.
 */
import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const FONT_PLACEHOLDER = "__KATEX_FONT_BASE__"

const require = createRequire(import.meta.url)
const katexPackage = require.resolve("katex/package.json")
const version = JSON.parse(readFileSync(katexPackage, "utf8")).version
const css = readFileSync(join(dirname(katexPackage), "dist", "katex.min.css"), "utf8")
const template = css.replace(/url\(fonts\//g, `url(${FONT_PLACEHOLDER}`)

const out = `// Generated from katex@${version} dist/katex.min.css — do not edit.
// Run \`pnpm --filter @ai-gui/plugin-katex generate:css\` to refresh.

/** The KaTeX release this stylesheet was taken from. */
export const KATEX_VERSION = ${JSON.stringify(version)}

/** Where \`katexInlineCss\` substitutes the host's font base. */
export const FONT_PLACEHOLDER = ${JSON.stringify(FONT_PLACEHOLDER)}

/** KaTeX's stylesheet with its font URLs left open. */
export const KATEX_CSS_TEMPLATE = ${JSON.stringify(template)}
`

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "katex-css.generated.ts")
writeFileSync(target, out)
process.stdout.write(`Wrote ${target} from katex@${version} (${template.length} bytes)\n`)
