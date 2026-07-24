# @ai-gui/plugin-sdk

Minimal authoring and test helpers for AIGUI plugins. The package has no test-runner dependency and is safe to import in Node.js.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/plugin-sdk
```

## Author a plugin

```ts
import { definePlugin } from "@ai-gui/plugin-sdk"

export const example = definePlugin({
  name: "example",
  nodeRenderers: {
    example: (node) => ({ kind: "html", html: node.content ?? "" }),
  },
})
```

`definePlugin` is an identity helper: it validates the plugin shape while preserving its concrete inferred type.

## Test a plugin

```ts
import { createTestNode, renderPluginNode } from "@ai-gui/plugin-sdk"

const output = await renderPluginNode(example, createTestNode("example", { content: "Hello" }))
```

For mount outputs, supply your own element and clean up safely:

```ts
import { mountOutputForTest } from "@ai-gui/plugin-sdk"

const cleanup = mountOutputForTest(output, element, optionalMountContext)
cleanup()
cleanup() // harmless; an underlying disposer runs at most once
```

## Exports

- Core authoring types: `AIGuiPlugin`, `ASTNode`, `CardDef`, `CollectNodeRendererOptions`, `JSONSchema`, `NodeRenderer`, `PluginCommitContext`, `RenderOutput`.
- Core helpers: `collectNodeRenderers`, `pluginNodeTypes`.
- SDK helpers: `definePlugin`, `createTestNode`, `getPluginRenderer`, `renderPluginNode`, `mountOutputForTest`.
