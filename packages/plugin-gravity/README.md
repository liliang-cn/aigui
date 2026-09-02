# @ai-gui/plugin-gravity

Gravity and collision figures for [AIGUI](../../README.md). The model states masses, orbits and
speeds; the trails, the orbital speeds, the periods and the collisions are computed.

## Install

```sh
pnpm add @ai-gui/plugin-gravity
```

No runtime dependency beyond `@ai-gui/core`. The output is SVG, animated in the browser and
complete as a still.

## Usage

```tsx
import { gravity } from "@ai-gui/plugin-gravity"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[gravity()]} />

// The model has no prior for this block, so the spec is what makes it usable at all.
const system = buildSystemPrompt({ registry, plugins: [gravity()], locale: "zh-CN" })
```

The model then emits:

````markdown
近日点 0.6 AU、偏心率 0.9 的彗星，远日点在 11.4 AU。

```gravity
{
  "units": "astronomical",
  "bodies": [
    { "id": "太阳", "mass": 1 },
    { "id": "彗星", "mass": 0, "orbit": { "around": "太阳", "distance": 0.6, "eccentricity": 0.9 } }
  ],
  "duration": 25,
  "caption": "彗星轨道"
}
```
````

## Why the protocol looks like this

**Conditions, never results.** A model asked for Earth's orbital speed answers 29.78 km/s from
memory, in the wrong units half the time, and a figure drawn from that number is a spiral. Given
`orbit: { around, distance }` the speed is derived from the condition, and the line under the
figure — speed, period, energy drift — is computed from the same numbers the trails are drawn
from, so it cannot disagree with the picture.

**A unit system, not a G.** `astronomical` is AU, years and solar masses, where G is 4π² exactly
and "Earth at 1 AU" comes out as one year without anyone typing `5.97e24`. `si` is for questions
already in metres and kilograms. `toy` is unitless with G = 1, or any value — G = 0 is a plain
collision table.

**An integrator, not an engine.** Kick-drift-kick leapfrog with a step that adapts to the closest
pair. It is symplectic, so the energy error oscillates instead of growing: Earth is still at 1 AU
after twenty orbits, to a few parts per million. A step cap ends a run that would otherwise never
finish (two point masses falling into each other) and the line under the figure says so.

**Collisions decided by radii.** `merge` coalesces two touching bodies, conserving mass and
momentum; `bounce` is an elastic impulse along the line of centres, conserving momentum and kinetic
energy. Either rule requires a radius on every body, because without one the rule is a promise the
figure cannot keep. The step also shrinks so a fast disc cannot tunnel through a small one.

## Supported

| | |
| --- | --- |
| Units | `astronomical`, `si`, `toy` (with optional `G`) |
| Bodies | `mass` (0 is a test particle), `position` + `velocity`, or `orbit` (`around`, `distance` as periapsis, `eccentricity`, `angle`, `direction`); `radius`, `color`, `fixed` |
| Collisions | `none`, `merge`, `bounce` |
| Under the figure | orbital speed and period per orbiting body, each collision with its time, the energy drift, and whether the step cap ended the run |

Not in this version, and the prompt spec tells the model to explain them in prose or use another
block: three-dimensional orbits, relativistic effects, tides and non-point bodies, air resistance.
Projectiles and free fall near the ground, and head-on one-dimensional collisions, belong in
[`@ai-gui/plugin-motion`](../plugin-motion/README.md), whose closed forms give exact numbers.

## Options

- `width?: number`, `height?: number` — figure size in CSS pixels, default 640 × 400.
- `maxBodies?: number` — refuse a scene with more bodies than this, default 12.
- `maxSteps?: number` — step cap, default 200 000.
- `maxSourceBytes?: number` — refuse a fence larger than this before parsing it, default 16 KiB.
- `animate?: boolean` — `false` draws every scene as a still; default `true`. The animation only
  moves the bodies along trails that are already drawn, so a still, a screenshot, or a reader who
  prefers reduced motion sees the whole story.

`theme` is honoured, so a figure on a dark page is drawn for one.

See the [root README](../../README.md) for the full plugin list.
