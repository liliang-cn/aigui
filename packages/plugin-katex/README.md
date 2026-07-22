# @aigui/plugin-katex

KaTeX math plugin for [AIGUI](../../README.md). Renders inline `$…$` and block `$$…$$` math.

## Install

```sh
pnpm add @aigui/plugin-katex
```

## Usage

```tsx
import { katex } from "@aigui/plugin-katex"
import { AIRenderer } from "@aigui/react"

<AIRenderer plugins={[katex()]} />
```

The model can then emit `$E = mc^2$` inline or a `$$…$$` block, and it renders as math. Include KaTeX's stylesheet in your app (the package exports `katexCss` for convenience).

See the [root README](../../README.md) for the full plugin list.
