# @ai-gui/plugin-motion

Mechanics figures for [AIGUI](../../README.md). The model gives the initial conditions; the
trajectory, the strobe marks and the numbers underneath are computed from closed forms.

## Install

```sh
pnpm add @ai-gui/plugin-motion
```

No runtime dependency beyond `@ai-gui/core`. The output is an SVG string.

## Usage

```tsx
import { motion } from "@ai-gui/plugin-motion"
<AIRenderer plugins={[motion()]} />
buildSystemPrompt({ registry, plugins: [motion()], locale: "zh-CN" })
```

````markdown
```motion
{
  "motion": "projectile",
  "speed": 20,
  "angle": 30,
  "show": ["trajectory", "strobe", "vectors"],
  "caption": "以 20 m/s、与水平成 30° 抛出"
}
```
````

renders the parabola, marks equal time intervals along it, and writes underneath:

> 射程 35.35 m，最大高度 5.1 m，飞行时间 2.04 s

## Stroboscopic, not animated

This is how a textbook draws motion, and the choice is deliberate. Equal time intervals mean the
**spacing between marks** is what shows the acceleration: it grows under gravity, shrinks under
braking, and bunches at the turning points of an oscillation. That is the lesson, and a static
figure carries it.

It also keeps the figure a pure function of its definition, so it renders identically on a server,
in a test and in a browser, and exports as an image.

A rigid-body engine was the alternative and would have been worse. A textbook problem is idealised
— no drag, a perfectly elastic collision — while an engine answers a slightly different question,
drifting in energy and jittering at rest. A student watching a “frictionless” block slow down
learns something false, and it is exactly the kind of plausible wrongness nobody catches.

## What is computed

| | |
| --- | --- |
| `projectile` | trajectory, range, apex, flight time. A launch above the ground solves the quadratic rather than using `v²sin2θ/g`, which assumes it lands where it started |
| `free-fall` | fall time and landing speed |
| `uniform-acceleration` | displacement and final speed; a braking body **stops when it stops** rather than reversing |
| `shm` | frequency, maximum speed and acceleration |
| `circular` | speed, angular speed, centripetal acceleration |
| `collision` | the velocities afterwards, from momentum alone (`inelastic`) or momentum and energy together (`elastic`), plus whether kinetic energy survived |

The model states none of these. A definition carrying `range`, `flightTime` or `velocityAfter` is
refused, and the line under the figure comes from the same numbers the curve is drawn from, so the
two cannot disagree.

Not in this version: two-dimensional collisions, air resistance or any varying force, rotating
frames, coupled oscillators, relativistic motion.

## Testing note

`src/fixtures/` holds the figures a model produced when given this plugin's prompt spec and twenty
textbook questions. They are part of the test suite.

See the [root README](../../README.md) for the full plugin list.
