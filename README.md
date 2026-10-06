# AIGUI

[![npm](https://img.shields.io/npm/v/@ai-gui/core?label=%40ai-gui%2Fcore)](https://www.npmjs.com/package/@ai-gui/core)
[![npm downloads](https://img.shields.io/npm/dm/@ai-gui/core)](https://www.npmjs.com/package/@ai-gui/core)
[![CI](https://github.com/liliang-cn/aigui/actions/workflows/ci.yml/badge.svg)](https://github.com/liliang-cn/aigui/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Render a streaming LLM answer as live UI — markdown, charts, diagrams, maths, 3D, topologies and app-defined cards — in React, Vue or plain DOM.

![A failover, drawn and played by the agent](docs/images/demo.gif)

[**Live demos**](https://liliang-cn.github.io/aigui/) · **Use it from Claude Code or Codex** — the agent draws charts, diagrams, 3D and topologies for you, as pictures or a live page: [install the plugin](#in-claude-code-and-codex).

| | |
| --- | --- |
| ![Chart](docs/images/chart.png) | ![Topology with a failover played step by step](docs/images/topology.png) |
| ![3D scene with labelled, stacked objects](docs/images/scene.png) | ![Molecule in 3D from SMILES](docs/images/molecule.png) |
| ![Orbits integrated from masses and distances](docs/images/gravity.png) | ![Sequence diagram](docs/images/mermaid.png) |

![Data wall](docs/images/bigscreen.png)

Every picture above was drawn by AIGUI from a fenced block a model wrote; the data is sample data.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/react      # or @ai-gui/vue, @ai-gui/vanilla
pnpm add @ai-gui/plugin-chart @ai-gui/plugin-mermaid @ai-gui/plugin-katex   # any plugins
```

| Package | |
| --- | --- |
| [`@ai-gui/core`](https://www.npmjs.com/package/@ai-gui/core) | Headless streaming parser, card registry, plugin engine, sanitizer |
| [`@ai-gui/react`](https://www.npmjs.com/package/@ai-gui/react) · [`@ai-gui/vue`](https://www.npmjs.com/package/@ai-gui/vue) · [`@ai-gui/vanilla`](https://www.npmjs.com/package/@ai-gui/vanilla) | Framework adapters |
| [`@ai-gui/plugin-chart`](https://www.npmjs.com/package/@ai-gui/plugin-chart) · [`@ai-gui/plugin-bigscreen`](https://www.npmjs.com/package/@ai-gui/plugin-bigscreen) · [`@ai-gui/plugin-dashboard`](https://www.npmjs.com/package/@ai-gui/plugin-dashboard) | ECharts charts, animated data walls, table + chart panels |
| [`@ai-gui/plugin-mermaid`](https://www.npmjs.com/package/@ai-gui/plugin-mermaid) · [`@ai-gui/plugin-katex`](https://www.npmjs.com/package/@ai-gui/plugin-katex) · [`@ai-gui/plugin-highlight`](https://www.npmjs.com/package/@ai-gui/plugin-highlight) | Diagrams, maths, code |
| [`@ai-gui/plugin-topology`](https://www.npmjs.com/package/@ai-gui/plugin-topology) · [`@ai-gui/plugin-graph`](https://www.npmjs.com/package/@ai-gui/plugin-graph) | Infrastructure topologies with playable steps, knowledge graphs |
| [`@ai-gui/plugin-scene`](https://www.npmjs.com/package/@ai-gui/plugin-scene) · [`@ai-gui/plugin-molecule`](https://www.npmjs.com/package/@ai-gui/plugin-molecule) · [`@ai-gui/plugin-map`](https://www.npmjs.com/package/@ai-gui/plugin-map) | 3D scenes, molecules, maps |
| [`@ai-gui/plugin-gravity`](https://www.npmjs.com/package/@ai-gui/plugin-gravity) · [`@ai-gui/plugin-motion`](https://www.npmjs.com/package/@ai-gui/plugin-motion) · [`@ai-gui/plugin-optics`](https://www.npmjs.com/package/@ai-gui/plugin-optics) · [`@ai-gui/plugin-physics`](https://www.npmjs.com/package/@ai-gui/plugin-physics) | Physics figures computed from the conditions |
| [`@ai-gui/plugin-solid`](https://www.npmjs.com/package/@ai-gui/plugin-solid) · [`@ai-gui/plugin-function`](https://www.npmjs.com/package/@ai-gui/plugin-function) · [`@ai-gui/plugin-figure`](https://www.npmjs.com/package/@ai-gui/plugin-figure) · [`@ai-gui/plugin-quote`](https://www.npmjs.com/package/@ai-gui/plugin-quote) | Geometry, functions, labelled figures, candlesticks |
| [`@ai-gui/plugin-ui`](https://www.npmjs.com/package/@ai-gui/plugin-ui) · [`@ai-gui/plugin-form`](https://www.npmjs.com/package/@ai-gui/plugin-form) · [`@ai-gui/plugin-primitives`](https://www.npmjs.com/package/@ai-gui/plugin-primitives) · [`@ai-gui/plugin-progress`](https://www.npmjs.com/package/@ai-gui/plugin-progress) · [`@ai-gui/plugin-flashcard`](https://www.npmjs.com/package/@ai-gui/plugin-flashcard) | Generated UI, forms, lists and tables, progress, flashcards |
| [`@ai-gui/plugin-citation`](https://www.npmjs.com/package/@ai-gui/plugin-citation) · [`@ai-gui/plugin-artifact`](https://www.npmjs.com/package/@ai-gui/plugin-artifact) · [`@ai-gui/plugin-evidence`](https://www.npmjs.com/package/@ai-gui/plugin-evidence) · [`@ai-gui/plugin-resultset`](https://www.npmjs.com/package/@ai-gui/plugin-resultset) | Sources, revisioned documents, host-written provenance and result tables |
| [`@ai-gui/plugin-sdk`](https://www.npmjs.com/package/@ai-gui/plugin-sdk) | Plugin authoring helpers |
| [`@ai-gui/openai`](https://www.npmjs.com/package/@ai-gui/openai) · [`@ai-gui/anthropic`](https://www.npmjs.com/package/@ai-gui/anthropic) · [`@ai-gui/vercel-ai`](https://www.npmjs.com/package/@ai-gui/vercel-ai) | Model stream adapters |
| [`@ai-gui/image`](https://www.npmjs.com/package/@ai-gui/image) · [`@ai-gui/openclaw`](https://www.npmjs.com/package/@ai-gui/openclaw) | Blocks to PNG in a headless browser; for picture-only chat channels |
| [`@ai-gui/mcp`](https://www.npmjs.com/package/@ai-gui/mcp) · [`@ai-gui/cli`](https://www.npmjs.com/package/@ai-gui/cli) · [`@ai-gui/live`](https://www.npmjs.com/package/@ai-gui/live) · [`@ai-gui/devtools`](https://www.npmjs.com/package/@ai-gui/devtools) | MCP server for agents, the system prompt as a file, server-driven cards, a stream timeline |

## Quick start

```tsx
import { useRef } from "react"
import { buildSystemPrompt } from "@ai-gui/core"
import { AIRenderer } from "@ai-gui/react"
import { chart } from "@ai-gui/plugin-chart"
import { mermaid } from "@ai-gui/plugin-mermaid"

const plugins = [chart(), mermaid()]
const system = buildSystemPrompt({ base: "You are a helpful assistant.", plugins })

export function Answer() {
  const ref = useRef(null)
  async function ask(question: string) {
    const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system, question }) })
    ref.current.reset()
    await ref.current.feed(res.body) // renders as the tokens arrive
  }
  return <AIRenderer ref={ref} plugins={plugins} />
}
```

`buildSystemPrompt` tells the model which blocks it may write; pass `locale: "zh-CN"` for the rules in Chinese. The backend only streams text — any language works.

## In Claude Code and Codex

```text
# Claude Code
/plugin marketplace add liliang-cn/aigui
/plugin install aigui@aigui

# Codex
codex plugin marketplace add liliang-cn/aigui
codex plugin add aigui@aigui
```

The agent can then draw: `aigui_render` returns PNGs, `aigui_open` opens a live page in your browser, `aigui_edit` changes a page in place, `aigui_export` saves it as PNG, PDF, a self-contained HTML file or a GIF/WebM of it playing, and `aigui_topology` draws a system straight from its docker-compose or Kubernetes files. Page text is English unless you ask for another language. See [`@ai-gui/mcp`](./packages/mcp/README.md).

To see the pictures inside Claude Code instead of an image viewer, add the [`img-view`](./mods/img-view/README.md) mod: `/plugin install img-view@aigui`. It shows each drawing in a pane beside the conversation, as real pixels in kitty, Ghostty, iTerm2 and WezTerm and as colour block art in any other terminal.

## Docs

- All packages on npm: [npmjs.com/org/ai-gui](https://www.npmjs.com/org/ai-gui)
- [Full guide](./docs/guide.md) — cards, actions, channels, plugins in depth
- [AGENTS.md](./AGENTS.md) — integrating the SDK, what the model may write, releasing
- Each package's README, under [`packages/`](./packages)

## License

MIT
