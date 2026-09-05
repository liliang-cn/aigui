# `@ai-gui/cli` — `aigui prompt`, the system prompt for backends that are not Node

Date: 2026-09-05. Status: approved (approach A of three).

## Goal

A Go, Rust, Python or Java backend cannot call `buildSystemPrompt`, so today it either receives the
prompt from the browser on every request or hand-copies a Node script. `aigui prompt` produces the
same string from a JSON config at build time, so a backend can read a file and never depend on the
frontend for its system prompt.

```sh
npx @ai-gui/cli prompt --plugins katex,mermaid,graph --locale zh-CN -o prompt.txt
npx @ai-gui/cli prompt --config aigui.prompt.json --json > prompt.json
npx @ai-gui/cli prompt --list
```

## Non-goals

- No other subcommands in this version. `aigui` is the bin so more can follow, but only `prompt`
  ships.
- No YAML, no JS config. JSON is what every backend language reads without a library.
- No watching, no bundler plugin.

## Package

`packages/cli`, published as `@ai-gui/cli`, `bin: { "aigui": "./bin/aigui.js" }`. The bin is a
committed two-line ESM file with a shebang that imports `../dist/cli.js`; the library entry
`dist/index.js` exports the programmatic API. Dependencies: `@ai-gui/core` and every public
`@ai-gui/plugin-*` as `workspace:*` (they share one version through the changeset fixed group, so
one install has everything). Plugins are `import()`ed by name on demand so an unused plugin is
never loaded. Argument parsing is Node's own `util.parseArgs`; no runtime dependency beyond the
workspace.

## Files (`packages/cli/src/`)

| file | exports |
| --- | --- |
| `catalog.ts` | `PLUGIN_CATALOG: Record<string, CatalogEntry>` — one entry per public plugin: `{ package, fence, factory: (options, ctx) => Promise<AIGuiPlugin>, promptOptions?: string[] }`; `pluginNames()` |
| `config.ts` | `PromptConfig`, `CardSpec`, `ActionSpec`, `readConfig(path)`, `mergeConfig(config, flags)`, `validateConfig(raw): PromptConfig` — errors name the field |
| `build.ts` | `buildPrompt(config): Promise<BuiltPrompt>` — creates `CardRegistry`, `ActionRegistry`/runtime, `ArtifactStore`, instantiates plugins, calls `buildSystemPrompt`; `BuiltPrompt { prompt, locale, plugins: string[], cards: string[] }` |
| `cli.ts` | `run(argv, io): Promise<number>` — parses flags, dispatches `prompt`, `--list`, `--help`, `--version`; `io = { stdout, stderr, writeFile }` injectable for tests; `bin/aigui.js` calls it with process streams and exits with its code |
| `index.ts` | re-exports `buildPrompt`, `PLUGIN_CATALOG`, `pluginNames`, `validateConfig`, types |

## Config

```jsonc
{
  "locale": "zh-CN",
  "base": "You are …",              // or
  "baseFile": "persona.md",         // relative to the config file
  "plugins": ["katex", "mermaid"],  // or, with options:
  "plugins": { "katex": { "chemistry": true }, "highlight": { "langs": ["go", "rust"] }, "graph": {} },
  "cards": [{ "type": "weather", "description": "Weather summary", "schema": { … }, "example": { … } }],
  "actions": [{ "type": "plan.submit", "schema": { … } }]
}
```

- `plugins` may be an array of names or an object of name → options. Unknown name → error listing
  the valid names. Options are passed to the factory as written; the CLI adds `registry`,
  `actionRuntime` and `store` for the plugins that need them (`ui`, `form`, `flashcards`,
  `artifact`).
- `cards` become `CardRegistry.register({ type, description, schema, example })`; `render` is not
  needed for the prompt. `actions` become `ActionRegistry.register({ type, schema, run: noop })`,
  which is what the `ui` and `flashcards` specs list.
- Flags override config: `--plugins` replaces the list (names only, default options),
  `--locale`, `--base`, `--base-file`, `--cards <file>` (a JSON array), `-o/--out`, `--json`.
- Order of plugins in the output = order given, same as passing the array to `buildSystemPrompt`.

## Output

Default: the prompt as text on stdout with one trailing newline, or to `--out`. `--json`:
`{ "version": "<cli version>", "locale": "zh-CN", "plugins": ["katex", …], "cards": ["weather"], "prompt": "…" }`.
`--list`: one line per plugin — name, package, fence, and the option names that change its prompt.
Exit codes: 0 ok, 1 usage or config error (message on stderr, nothing on stdout).

## Guarantee

The string is exactly what the browser would get from `buildSystemPrompt({ base, registry,
plugins, locale })` with the same inputs, because it is that function. A test builds both ways
and compares.

## Tests (`packages/cli/src/*.test.ts`)

- `catalog.test.ts`: every non-private `packages/plugin-*` has a catalog entry and vice versa;
  every entry's factory produces a plugin with a `name` under plain Node.
- `config.test.ts`: array and object `plugins`; unknown plugin; bad card (missing type); `baseFile`
  resolved relative to the config; flags override.
- `build.test.ts`: equals `buildSystemPrompt` built by hand for `[katex{chemistry}, graph]` +
  one card; `ui` with cards and actions lists them; `plugins: []` and no cards → just `base`.
- `cli.test.ts`: `run(["prompt","--plugins","graph","--locale","zh-CN"])` writes the prompt to
  stdout; `--json` parses and carries the fields; `--out` writes the file; `--list` names every
  plugin; unknown plugin → exit 1, stderr names it, stdout empty; `--help`, `--version`.

## Integration

vitest alias + project `cli`; changeset fixed group; `.changeset/cli.md` minor; README package
tables and a "Backends in other languages" paragraph pointing at `aigui prompt`; AGENTS.md step 6
note; package README with the config reference.

## Alternatives considered

- **B — `bin` inside `@ai-gui/core`**, plugins imported by name from whatever the user installed.
  Rejected: core grows a CLI, and a missing plugin package fails at runtime instead of install.
- **C — a documented Node snippet.** Rejected: every backend team copies it, and none of them keeps
  it in step with the plugin list.
