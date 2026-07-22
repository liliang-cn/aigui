# @aigui/plugin-highlight

Syntax-highlighting plugin for [AIGUI](../../README.md), powered by [Shiki](https://shiki.style). Overrides fenced code blocks with highlighted output. Async.

## Install

```sh
pnpm add @aigui/plugin-highlight
```

## Usage

```tsx
import { highlight } from "@aigui/plugin-highlight"
import { AIRenderer } from "@aigui/react"

<AIRenderer plugins={[highlight({ themes: ["github-dark"], langs: ["ts", "python"] })]} />
```

## Options

- `themes?: string[]` — themes to load; the first is the default when `theme` is omitted.
- `langs?: string[]` — grammars to load; a code block whose language is not listed falls back to plain text.
- `theme?: string` — theme used for rendering; defaults to the first entry of `themes`.

See the [root README](../../README.md) for the full plugin list.
