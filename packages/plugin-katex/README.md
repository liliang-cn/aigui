# @ai-gui/plugin-katex

KaTeX math plugin for [AIGUI](../../README.md). Renders inline `$…$` and block `$$…$$` math.

## Install

```sh
pnpm add @ai-gui/plugin-katex
```

## Usage

```tsx
import { katex } from "@ai-gui/plugin-katex"
import { AIRenderer } from "@ai-gui/react"

<AIRenderer plugins={[katex()]} />
```

The model can then emit `$E = mc^2$` inline or a `$$…$$` block, and it renders as math. The plugin also carries the model-facing rules for writing TeX, so `buildSystemPrompt({ plugins })` tells the model it may use maths at all — without that a physics answer comes back in plain text.

## Stylesheet

KaTeX ships its own CSS, and that CSS points at `fonts/…` relative to itself. With a bundler, import it — one line, and the font files are emitted alongside it:

```ts
import "@ai-gui/plugin-katex/style.css"
```

This is the exception to the renderers injecting `plugin.css` automatically. The plugin's default `css` is a bare `@import`, which a `<style>` element cannot resolve — the browser would look for `/katex/dist/katex.min.css` on your origin — so the renderers skip it on purpose.

A host with no build step passes the stylesheet itself. Fonts still have to come from somewhere, so say where:

```ts
import { katex } from "@ai-gui/plugin-katex"
import { katexInlineCss } from "@ai-gui/plugin-katex/inline-css"

// Self-hosted: copy katex/dist/fonts into your assets. Best for a LAN-served app.
katex({ css: katexInlineCss({ fontBase: "/assets/katex/fonts/" }) })

// Omitting fontBase falls back to a version-pinned CDN, which needs the network.
katex({ css: katexInlineCss() })
```

`inline-css` is a separate entry point so the ~24 kB of CSS text is only in the bundle of a host that asked for it.

## Options

- `chemistry?: boolean` — load KaTeX's mhchem extension, which is what renders `\ce{}` and `\pu{}`. Also adds the mhchem notation to the prompt spec.
- `css?: string` — the stylesheet this plugin declares, overriding the `@import` default. See above.

See the [root README](../../README.md) for the full plugin list.
