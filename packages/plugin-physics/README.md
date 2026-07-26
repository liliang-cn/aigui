# @ai-gui/plugin-physics

Force and vector diagrams for [AIGUI](../../README.md). The plugin claims one `physics` fence and draws the bodies, surfaces, vectors and angles it declares as SVG.

It is a drawing, not a simulation. A mechanics lesson needs the picture a textbook draws — a body, the forces on it as labelled arrows, their angles, one force resolved into components. A rigid-body engine gives a teacher no way to label the intermediate quantities, stop at three seconds, or show a force that is in equilibrium and therefore never moves anything. So this takes coordinates and draws them; the numbers are the model's to get right.

## Install

```sh
pnpm add @ai-gui/plugin-physics
```

## Usage

```tsx
import { physics, physicsCss } from "@ai-gui/plugin-physics"
import { AIRenderer } from "@ai-gui/react"

<style>{physicsCss}</style>
<AIRenderer plugins={[physics()]} />
```

A block on a 30° incline, gravity resolved along it:

    ```physics
    {"version":1,"title":"斜面上的物块",
     "bodies":[{"at":[0,0],"shape":"box","width":60,"height":40,"rotation":30,"label":"m"}],
     "surfaces":[{"from":[-120,-70],"to":[120,65],"hatch":true}],
     "vectors":[
       {"magnitude":90,"angle":-90,"style":"force","label":"mg"},
       {"magnitude":78,"angle":120,"style":"force","label":"N"},
       {"magnitude":45,"angle":-150,"style":"component","dashed":true,"label":"mg sin θ"}],
     "angles":[{"at":[-120,-70],"from":0,"to":30,"label":"θ = 30°"}]}
    ```

`y` increases upwards and angles are counter-clockwise from the positive x axis, because that is how a mechanics problem states them: gravity points at angle `-90`, an incline is `30`. The flip to screen coordinates happens once for the whole drawing, and labels flip back so text stays upright.

A vector is given either as `to` (its tip) or as `magnitude` with `angle`. Omit `from` and it starts at the first body. `"style":"component"` with `"dashed":true` is the convention for a resolved component.

`hatch` on a surface marks the solid side — the ground, a wall.

The same y-up convention is used by [`@ai-gui/plugin-figure`](../plugin-figure), for diagrams whose point is naming the parts.

## API

- `physics(options?)` creates the AIGUI plugin.
- `physicsPromptSpec(options?)` returns the model-facing protocol description.
- `parsePhysicsDiagram(source, options?)` strictly parses and validates a block.
- `renderPhysicsSVG(diagram, options?)` renders a parsed diagram.
- `physicsCss` contains the package styling.

## Options

- `width?: number`: the rendered maximum width in px, default `460`.
- `height?: number`: the rendered maximum height in px, default `340`.
- `maxElements?: number`: per element list, default `40`.
- `maxSourceBytes?: number`: default 8 KiB.

Unknown fields, URLs, non-finite coordinates, unknown shapes and vector styles, and oversized blocks are rejected, and the block renders an error in place rather than a confident drawing of something the model did not mean.

Colours come from `currentColor` and `--aigui-physics-*` custom properties, so a diagram on a dark page is not drawn in ink chosen for a light one. Output is marked `trusted` because it is built from coordinates rather than from model markup; a sanitizer would otherwise strip the drawing.

There is no runtime dependency beyond `@ai-gui/core`.
