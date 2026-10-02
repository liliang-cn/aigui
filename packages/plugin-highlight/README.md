# @ai-gui/plugin-highlight

Syntax-highlighting plugin for [AIGUI](../../README.md), powered by [Shiki](https://shiki.style). Overrides fenced code blocks with highlighted output. Async.

## Install

```sh
pnpm add @ai-gui/plugin-highlight
```

## Usage

```tsx
import { highlight } from "@ai-gui/plugin-highlight"
import { AIRenderer } from "@ai-gui/react"

<AIRenderer plugins={[highlight({ themes: ["github-dark"], langs: ["ts", "python"] })]} />
```

## Options

- `themes?: string[]` — themes to load; the first is the default when `theme` is omitted.
- `langs?: string[]` — grammars to load up front, and the ones the prompt spec names to the model.
- `loadOnDemand?: boolean` — default `true`: a block in a language not in `langs` gets its grammar loaded on first use when Shiki bundles one by that name or alias (`c`, `toml`, `yaml`, `sh`, …); a name Shiki does not know stays plain text. Set `false` to highlight only `langs`.
- `theme?: string` — theme used for rendering; defaults to the first entry of `themes`.

The plugin also carries a prompt spec asking the model to tag every fence with its language and naming the grammars that were loaded, since a block whose language is missing cannot be highlighted. Pass `plugins` to `buildSystemPrompt` to include it.

See the [root README](../../README.md) for the full plugin list.
