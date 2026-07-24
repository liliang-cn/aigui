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

The model can emit flowcharts, UML-style class/sequence/state diagrams, ER diagrams, journeys, Gantt charts, mind maps, timelines, Git graphs, and other Mermaid-supported diagram types.

Flowchart:

    ```mermaid
    graph TD; A-->B; A-->C;
    ```

UML class diagram:

    ```mermaid
    classDiagram
      class Renderer { +push(chunk) +reset() }
      Renderer --> AST : produces
    ```

Sequence diagram:

    ```mermaid
    sequenceDiagram
      LLM->>AIGUI: streamed tokens
      AIGUI-->>App: AST patches
    ```

## Options

- `theme?: string` — Mermaid theme. Mermaid has process-global configuration, so the theme of the first render wins across plugin instances; later instances share that initialization.
- `maxSourceBytes?: number` — maximum UTF-8 source size, default 64 KiB.

Renders use Mermaid `securityLevel: "strict"`, are complete-gated, and are queued across instances because Mermaid mutates global state while rendering. Errors use a generic non-reflective fallback and diagram IDs remain unique across concurrent renders.

See the [root README](../../README.md) for the full plugin list.
