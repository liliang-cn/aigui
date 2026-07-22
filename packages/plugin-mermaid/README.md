# @ai-gui/plugin-mermaid

Mermaid diagram plugin for [AIGUI](../../README.md). Renders ` ```mermaid ` fenced blocks as diagrams. The block is complete-gated: a skeleton shows while it streams, then the full diagram renders.

## Install

```sh
pnpm add @ai-gui/plugin-mermaid
```

## Usage

```tsx
import { mermaid } from "@ai-gui/plugin-mermaid"
import { AIRenderer } from "@ai-gui/react"

<AIRenderer plugins={[mermaid({ theme: "default" })]} />
```

The model emits, e.g.:

    ```mermaid
    graph TD; A-->B; A-->C;
    ```

## Options

- `theme?: string` — Mermaid theme.

See the [root README](../../README.md) for the full plugin list.
