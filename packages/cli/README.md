# @ai-gui/cli

The `aigui` command line for [AIGUI](../../README.md). One subcommand so far: `aigui prompt`
writes the system prompt — exactly what `buildSystemPrompt({ base, registry, plugins, locale })`
gives the browser — from a JSON config or from flags, so a Go, Rust, Python or Java backend can
read it from a file instead of receiving it from the frontend on every request.

## Install and run

```sh
npx @ai-gui/cli prompt --plugins katex,mermaid,graph --locale zh-CN -o prompt.txt
npx @ai-gui/cli prompt --config aigui.prompt.json --json > prompt.json
npx @ai-gui/cli prompt --list
```

Or add it to a project and call `aigui` from a script. The package depends on every published
`@ai-gui/plugin-*`, so one install has every plugin; a plugin is imported only when it is named.

## Config

```jsonc
{
  "locale": "zh-CN",
  "baseFile": "persona.md",          // or "base": "You are …" — relative to this file
  "plugins": {                        // or a plain list: ["katex", "mermaid", "graph"]
    "katex": { "chemistry": true },
    "highlight": { "langs": ["go", "rust", "python"] },
    "mermaid": {},
    "graph": {}
  },
  "cards": [
    { "type": "weather", "description": "Weather summary",
      "schema": { "type": "object", "properties": { "city": { "type": "string" }, "tempC": { "type": "number" } } },
      "example": { "city": "Tokyo", "tempC": 24 } }
  ],
  "actions": [
    { "type": "plan.submit", "schema": { "type": "object" } }
  ]
}
```

| field | meaning |
| --- | --- |
| `base` / `baseFile` | The persona, written first. One or the other. |
| `locale` | BCP-47 tag the rules are written in; plugins fall back to English. |
| `plugins` | Names from `aigui prompt --list`, as a list or as name → factory options. The prompt lists the plugins in this order. |
| `cards` | Your card types, prompt-facing fields only: `type`, `description`, `schema`, `example`. No `render`. |
| `actions` | Action types the `ui` and `flashcards` blocks may name, with an optional params schema. |

Flags override the file: `--plugins` replaces the list (default options), `--locale`, `--base`
or `--base-file`, `--cards <file>` (a JSON array). `--out` writes a file; `--json` writes
`{ "version", "locale", "plugins", "cards", "prompt" }`.

Only some factory options change a prompt — `katex.chemistry`, `highlight.langs`, the limits of
`figure`, `physics`, `progress` and `molecule`, and `ui.limits`. `--list` shows them per plugin.
Every other option is accepted and changes nothing here.

## What it guarantees

- **The same string the browser gets.** There is no second implementation: the CLI builds a
  `CardRegistry` and the plugin instances from the JSON and calls `buildSystemPrompt`. A test
  builds the prompt both ways and compares.
- **Nothing on stdout when it fails.** An unknown plugin, a missing file, a misspelt key: exit 1,
  one line on stderr, so a build script piping stdout to a file never captures an error as its
  prompt.
- **Strict config.** A key the config does not know is refused with its name, because a misspelt
  key would silently drop a block from the prompt and nobody would notice until the model never
  used it.

## Programmatic use

```ts
import { buildPrompt, validateConfig } from "@ai-gui/cli"

const config = validateConfig(JSON.parse(text), { dir: process.cwd(), readText: (p) => fs.readFileSync(p, "utf8") })
const { prompt } = await buildPrompt(config)
```

## From another language

Run it once in CI or at build time, commit or ship the file, read it at startup:

```go
system, _ := os.ReadFile("prompt.txt")
```

The frontend still needs the same plugins installed to render what the model writes, and the
prompt has to be regenerated when that list changes — which is what putting `aigui prompt` in the
build makes automatic.
