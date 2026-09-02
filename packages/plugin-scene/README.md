# @ai-gui/plugin-scene

3D scenes for [AIGUI](../../README.md). The model places boxes, spheres, cylinders, cones and — where
the host allows it — glTF models in space, and the reader turns the result with the mouse.

## Install

```sh
pnpm add @ai-gui/plugin-scene
```

`three` is a dependency and is imported only when a scene is actually drawn, so a page whose answers
contain no scene never loads it.

## Usage

```tsx
import { scene } from "@ai-gui/plugin-scene"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[scene()]} />

// The model has no prior for this block, so the spec is what makes it usable at all.
const system = buildSystemPrompt({ registry, plugins: [scene()], locale: "zh-CN" })
```

The model then emits:

````markdown
一张 1.4 m × 0.8 m 的餐桌，桌面高 0.72 m。

```scene
{
  "objects": [
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, -0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [-0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "cylinder", "radius": 0.04, "height": 0.72, "position": [0.6, 0, 0.35], "anchor": "bottom", "color": "#8b5a2b" },
    { "shape": "box", "size": [1.4, 0.04, 0.8], "position": [0, 0.72, 0], "anchor": "bottom", "color": "wheat", "label": "桌面" }
  ],
  "caption": "餐桌"
}
```
````

## Why the protocol looks like this

**A flat list, not a scene graph.** A model writes a list of placed shapes correctly far more often
than it nests transforms. Everything is positioned in one frame: metres, y up, ground at y = 0.

**The two sums it kept getting wrong are gone.** `anchor: "bottom"` puts a thing on the ground
without the model halving its height, and a `model` file's `size` names the longest side the file
should be scaled to — a model that has never seen the file cannot know whether it was authored in
metres or centimetres.

**Nothing in a fence can make the page fetch anything.** A `model` URL is refused unless its exact
origin is in `allowedModelOrigins`, which only the host sets; the comparison is against the URL's
origin, so `https://cdn.example.com.evil.net` does not pass for `https://cdn.example.com`. Only
`https` is accepted, never with credentials. A refused file costs that one object, not the scene:
the table the model built around it is still drawn, and a line beneath it says what is missing and
why. That is the host's policy at work, not the model's mistake — a malformed URL is still refused
like any other bad field.

**Unknown fields are refused, not skipped.** A model that wrote `texture` or `children` wanted
something this protocol does not offer, and dropping it quietly draws the wrong picture without
saying so.

## Supported

| | |
| --- | --- |
| Shapes | `box`, `sphere`, `cylinder` (with `radiusTop` for a frustum), `cone`, both with `sides` to make them faceted — a 4-sided cone is a hipped roof, a 6-sided cylinder a hex nut — `torus` (lying flat, axis y), `capsule`, `plane` (lying flat), `model` (glTF/GLB) |
| Placement | `position`, `rotation` in degrees, `anchor` (`center` or `bottom`) |
| Appearance | `color` (hex or a colour name), `opacity`, `material` (`matte`, `metal`, `glass`), `wireframe`, `label` |
| Scene | `camera` (`position`, `target`; otherwise framed automatically), `grid`, `autoRotate`, `caption` |

Not in this version, and the prompt spec tells the model to explain them in prose instead: boolean
operations, curved-surface modelling, textures, animation, physics, lighting setup. The spec also
sends solid-geometry questions to [`@ai-gui/plugin-solid`](../plugin-solid/README.md), whose
figures are computed from a textbook's conditions rather than placed by hand.

## Options

- `height?: number` — canvas height in CSS pixels, default 360.
- `allowedModelOrigins?: string[]` — exact HTTPS origins a `model` may be loaded from, e.g.
  `["https://assets.example.com"]`. Absent or empty, every `model` object is left out of its scene
  with a note saying so.
- `maxObjects?: number` — refuse a scene with more objects than this, default 64.
- `maxSourceBytes?: number` — refuse a fence larger than this before parsing it, default 32 KiB.

Dragging turns the scene and the wheel zooms within bounds; there is no authoring. `theme` is
honoured, so a scene on a dark page is lit and gridded for one. A model file that fails to load
leaves the rest of the scene up and names the origin it could not load from beneath it.

## Testing note

`src/fixtures/` holds the 11 scenes a model actually produced when given this plugin's prompt spec
and twelve requests through `claude -p` — furniture, a snowman, a bridge, a bolt, a robot file placed
on a table. The twelfth request, a cube section, correctly produced no scene. They are part of the
test suite: a protocol change they stop parsing is a change that breaks answers already being
written.

See the [root README](../../README.md) for the full plugin list.
