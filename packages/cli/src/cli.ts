import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { buildPrompt } from "./build"
import { PLUGIN_CATALOG, pluginNames } from "./catalog"
import { ConfigError, applyFlags, parseJsonFile, readConfig, validateConfig, type PromptConfig } from "./config"

/**
 * The command line, as a function of its arguments and an injectable IO.
 *
 * `run` never touches `process`: tests hand it fake streams and a fake file writer, and `main`
 * is the two lines that connect it to the real ones. Everything a user can get wrong — an unknown
 * flag, a missing file, a plugin name that does not exist — comes back as exit code 1 with one
 * line on stderr and nothing on stdout, so a build script that captures stdout never captures an
 * error message as its prompt.
 */

export interface CliIO {
  stdout: (text: string) => void
  stderr: (text: string) => void
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<void>
}

const USAGE = `Usage: aigui prompt [options]

Write the AIGUI system prompt — what buildSystemPrompt({ base, registry, plugins, locale })
gives the browser — from a JSON config or from flags, for a backend that is not Node.

Options:
  -c, --config <file>     JSON config: base | baseFile, locale, plugins, cards, actions
  -p, --plugins <names>   comma-separated plugin names; replaces the config's list
  -l, --locale <tag>      language of the rules, e.g. zh-CN (default: English)
  -b, --base <text>       persona text to put first
      --base-file <file>  read the persona from a file
      --cards <file>      JSON array of cards: { type, description, schema?, example? }
  -o, --out <file>        write here instead of stdout
      --json              write { version, locale, plugins, cards, prompt } as JSON
      --list              list the plugin names, packages, fences and prompt-affecting options
  -h, --help
  -v, --version

Examples:
  aigui prompt --plugins katex,mermaid,graph --locale zh-CN -o prompt.txt
  aigui prompt --config aigui.prompt.json --json > prompt.json
`

async function version(io: CliIO): Promise<string> {
  const manifest = JSON.parse(await io.readFile(fileURLToPath(new URL("../package.json", import.meta.url)))) as { version: string }
  return manifest.version
}

function list(): string {
  const rows = pluginNames().map((name) => {
    const entry = PLUGIN_CATALOG[name]
    return [name, entry.package, entry.fence, entry.promptOptions.join(",") || "-"]
  })
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i].length)))
  return rows.map((row) => `${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2].padEnd(widths[2])}  ${row[3]}`).join("\n") + "\n"
}

const OPTIONS = {
  config: { type: "string", short: "c" },
  plugins: { type: "string", short: "p" },
  locale: { type: "string", short: "l" },
  base: { type: "string", short: "b" },
  "base-file": { type: "string" },
  cards: { type: "string" },
  out: { type: "string", short: "o" },
  json: { type: "boolean" },
  list: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const

const parse = (args: string[]) => parseArgs({ args, allowPositionals: true, strict: true, options: OPTIONS })

export async function run(argv: string[], io: CliIO): Promise<number> {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 1
  }
  const { values, positionals } = parsed
  if (values.help) {
    io.stdout(USAGE)
    return 0
  }
  if (values.version) {
    io.stdout(`${await version(io)}\n`)
    return 0
  }
  const command = positionals[0]
  if (command !== "prompt") {
    io.stderr(command === undefined ? USAGE : `Unknown command "${command}".\n\n${USAGE}`)
    return 1
  }
  if (values.list) {
    io.stdout(list())
    return 0
  }

  try {
    let config: PromptConfig = values.config !== undefined ? await readConfig(values.config) : validateConfig({}, { dir: process.cwd(), readText: () => "" })
    if (values.base !== undefined && values["base-file"] !== undefined) throw new ConfigError("--base and --base-file cannot both be given")
    const base = values["base-file"] !== undefined ? await io.readFile(values["base-file"]).catch(() => Promise.reject(new ConfigError(`${values["base-file"]} could not be read`))) : values.base
    const cards = values.cards !== undefined ? parseJsonFile(values.cards, await io.readFile(values.cards).catch(() => Promise.reject(new ConfigError(`${values.cards} could not be read`)))) : undefined
    config = applyFlags(config, {
      plugins: values.plugins?.split(",").map((name) => name.trim()).filter(Boolean),
      locale: values.locale,
      base,
      cards,
    })
    const built = await buildPrompt(config)
    const text = values.json
      ? `${JSON.stringify({ version: await version(io), locale: built.locale, plugins: built.plugins, cards: built.cards, prompt: built.prompt }, null, 2)}\n`
      : `${built.prompt}\n`
    if (values.out !== undefined) await io.writeFile(values.out, text)
    else io.stdout(text)
    return 0
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr(`${error.message}\n`)
      return 1
    }
    throw error
  }
}

/** `run` on the real process. Returns the exit code; the bin sets `process.exitCode` from it. */
export async function main(argv: string[]): Promise<number> {
  return run(argv, {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, text) => writeFile(path, text, "utf8"),
  })
}
