# @ai-gui/plugin-solid

Solid-geometry teaching figures for [AIGUI](../../README.md). The model names a solid and the
conditions on it — 正方体 ABCD-A1B1C1D1, 过 A、B1、D1 的截面 — and the figure is computed from those.

## Install

```sh
pnpm add @ai-gui/plugin-solid
```

`three` is a dependency and is imported only when a figure is actually drawn, so a page whose
answers contain no geometry never loads it.

## Usage

```tsx
import { solid } from "@ai-gui/plugin-solid"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[solid()]} />

// The model has no prior for this block, so the spec is what makes it usable at all.
const system = buildSystemPrompt({ registry, plugins: [solid()], locale: "zh-CN" })
```

The model then emits:

````markdown
平面 AB₁D₁ 截正方体，截面是正三角形。

```solid
{
  "solid": "cube",
  "label": "ABCD-A1B1C1D1",
  "edge": 2,
  "section": { "through": ["A", "B1", "D1"] },
  "highlight": [{ "plane": ["A", "B1", "D1"] }],
  "caption": "平面 AB1D1 截正方体所得的截面"
}
```
````

## Why the protocol looks like this

**Conditions, never results.** The model says *which three points the plane passes through*; the
section polygon is computed here. A model asked instead for the shape sometimes answers "五边形"
when it is a hexagon, and a figure drawn from that answer would be wrong in a way a student cannot
see. Vertex coordinates are refused for the same reason: they put the model's arithmetic into the
picture.

**The textbook's own vocabulary.** A model is fluent in `正方体 ABCD-A1B1C1D1` — it has seen the
notation hundreds of thousands of times — and is not fluent in `{"vertices": [[0,0,0], …]}`.

**Every reference must resolve.** A figure naming a point that was never defined is refused rather
than drawn without it. `{"plane": ["P", "A", "B"]}` on a cone is the right shape in every field and
still meaningless, because a cone has no A or B until `onCircle` puts them there.

## Supported

| | |
| --- | --- |
| Solids | `cube`, `cuboid`, `prism` (3–6 sides), `pyramid` (3–6 sides), `cylinder`, `cone`, `sphere` |
| Points | along a segment (`on` + `at`), a face centre (`center`), the foot of a perpendicular (`foot`), a point on a circle (`onCircle` + `angle`) |
| Marks | `segments` (solid or dashed), `section` through three points, `highlight` of a line, plane, or angle |
| Apex | `apexOver: "A"` puts the apex above one vertex, which is what makes `PA ⊥ 底面` drawable — the default regular pyramid would contradict the explanation |

Not in this version, and the prompt spec tells the model to explain them in prose instead: net
diagrams and shortest-path unfoldings, non-axial sections of cones and cylinders (they are conics,
not polygons), animation of a moving point, compound or hollowed solids, coordinate annotation.

## Options

- `height?: number` — figure height in CSS pixels, default 320.
- `maxPoints?: number` — refuse a figure introducing more than this many points, default 24.
- `maxSourceBytes?: number` — refuse a fence larger than this before parsing it, default 16 KiB.

Dragging turns the figure; there is no authoring, panning or unbounded zoom. `theme` is honoured,
so a figure on a dark page is drawn for one.

## Testing note

`src/fixtures/` holds the 19 figures a model actually produced when given this plugin's prompt spec
and twenty textbook questions. They are part of the test suite: a protocol change they stop parsing
is a change that breaks answers already being written.

See the [root README](../../README.md) for the full plugin list.
