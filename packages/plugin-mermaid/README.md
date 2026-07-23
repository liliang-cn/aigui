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

- `theme?: string` — Mermaid theme. Mermaid has process-global configuration, so the theme of the first render wins across plugin instances; later instances share that initialization.

Renders are queued across instances because Mermaid mutates global state while rendering. This also guarantees unique diagram IDs for concurrent renders.

See the [root README](../../README.md) for the full plugin list.
