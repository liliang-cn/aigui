# @ai-gui/plugin-primitives

Primitive UI-block plugin for [AIGUI](../../README.md). Adds four structured, data-driven blocks the model can emit as fenced JSON: `list`, `table`, `key-value`, and `layout`.

## Install

```sh
pnpm add @ai-gui/plugin-primitives
```

## Usage

```tsx
import { primitives } from "@ai-gui/plugin-primitives"
import { AIRenderer } from "@ai-gui/react"

<AIRenderer plugins={[primitives()]} />
```

The model emits, e.g.:

    ```table {"headers":["City","°C"],"rows":[["Tokyo",24],["Oslo",9]]}```
    ```list {"items":["one","two","three"]}```
    ```key-value {"pairs":{"status":"ok","count":3}}```
    ```layout {"direction":"row","items":[...]}```

## Exports

- `primitives()` — the plugin.
- `primitivesPromptSpec()` — the prompt-spec string describing these blocks (also folded in automatically by `buildSystemPrompt` when the plugin is passed).

See the [root README](../../README.md) for the full plugin list.
