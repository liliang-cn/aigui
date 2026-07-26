# @ai-gui/plugin-figure

Labelled figures for [AIGUI](../../README.md). The plugin claims one `figure` fence and draws the parts it declares as SVG, with leader-line callouts naming each one.

This is the diagram whose point is what the parts are *called*: a cell with its organelles named, a leaf's layers, apparatus with the parts a method refers to, a labelled cross-section. Use `mermaid` for boxes joined by arrows and `chart` for data.

## Install

```sh
pnpm add @ai-gui/plugin-figure
```

## Usage

```tsx
import { figure, figureCss } from "@ai-gui/plugin-figure"
import { AIRenderer } from "@ai-gui/react"

<style>{figureCss}</style>
<AIRenderer plugins={[figure()]} />
```

    ```figure
    {"version":1,"title":"动物细胞","caption":"图 1 动物细胞的基本结构","parts":[
      {"at":[0,0],"width":220,"height":160,"fill":"none","label":"细胞膜","note":"控制物质进出"},
      {"at":[-20,10],"width":70,"height":60,"fill":"solid","label":"细胞核","note":"储存 DNA"},
      {"at":[55,-30],"width":40,"height":22,"rotation":25,"label":"线粒体","note":"供能"},
      {"shape":"polygon","points":[[-70,-40],[-40,-55],[-30,-30],[-60,-20]],"label":"高尔基体"}
    ]}
    ```

Labels are laid out for you. Omit `labelAt` and each callout goes out to the side its part is already on, stacked down that side in top-to-bottom order — so a model can name six organelles without also solving a layout problem whose result it cannot see. Give `labelAt` to place one yourself.

`y` increases upwards, the same convention as [`@ai-gui/plugin-physics`](../plugin-physics), so a lesson that draws both does not hold two conventions at once.

Complex outlines are a `polygon`: a point list can be validated, where hand-written path data cannot. Nothing is shipped as artwork, so nothing here decides which figures a curriculum may teach.

## API

- `figure(options?)` creates the AIGUI plugin.
- `figurePromptSpec(options?)` returns the model-facing protocol description.
- `parseFigure(source, options?)` strictly parses and validates a block.
- `renderFigureSVG(diagram, options?)` renders a parsed figure.
- `figureCss` contains the package styling.

## Options

- `width?: number`: the rendered maximum width in px, default `480`.
- `height?: number`: the rendered maximum height in px, default `360`.
- `maxParts?: number`: default `32`.
- `maxSourceBytes?: number`: default 8 KiB.

Unknown fields, URLs, non-finite coordinates, unknown shapes and fills, polygons under three points, and oversized blocks are rejected, and the block renders an error in place rather than a confident drawing of something the model did not mean.

Colours come from `currentColor` and `--aigui-figure-*` custom properties, so a figure on a dark page is not drawn in ink chosen for a light one. Output is marked `trusted` because it is built from coordinates rather than from model markup; a sanitizer would otherwise strip the drawing.
