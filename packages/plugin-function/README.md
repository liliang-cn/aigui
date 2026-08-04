# @ai-gui/plugin-function

Function and calculus figures for [AIGUI](../../README.md). The model writes `y = f(x)` and an
interval; the curve, its tangents, the area under it and its Riemann rectangles are computed here.

## Install

```sh
pnpm add @ai-gui/plugin-function
```

No plotting library, no canvas, no runtime dependency beyond `@ai-gui/core`. The output is an SVG
string.

## Usage

```tsx
import { fn } from "@ai-gui/plugin-function"
import { buildSystemPrompt } from "@ai-gui/core"

<AIRenderer plugins={[fn()]} />

// The model has no prior for this block, so the spec is what makes it usable at all.
const system = buildSystemPrompt({ registry, plugins: [fn()], locale: "zh-CN" })
```

````markdown
f(x) = x² 在 x = 1 处的切线斜率为 2，切线方程 y = 2x − 1。

```function
{
  "plot": [{ "id": "f", "expr": "x^2", "domain": [-1.5, 2.5], "label": "y = x²" }],
  "marks": [
    { "tangent": { "of": "f", "at": 1 } },
    { "point": { "on": "f", "at": 1, "label": "P(1, 1)" } }
  ],
  "caption": "f(x) = x² 在 P(1,1) 处的切线"
}
```
````

## Why the protocol looks like this

**An expression, never sampled points.** A model that plots the curve itself has put its own
arithmetic into the picture, and a wrong point looks exactly like a right one. A definition
containing `points`, `data`, `values` or `samples` is refused outright.

**The slope is measured, not stated.** `tangent` takes the point; the derivative is computed by
central difference. An answer that mis-differentiates in its prose still draws the right line —
and the `k = …` label on the figure comes from the same measurement, so the picture cannot
contradict itself.

**Every reference must resolve.** A mark naming a curve no `plot` defines is refused rather than
skipped, so a figure never silently omits the thing the answer is pointing at.

**Intervals may be written the way a question states them.** `[0, "2*pi"]` and `["-pi/2", "pi/2"]`
are constant expressions, evaluated by the same parser. Forcing `6.283185` is unnatural and is one
more place for the model to do arithmetic.

## The expression grammar

`x` is the only variable. Multiplication is always explicit (`2*x`, never `2x`), powers use `^`,
and functions need brackets. Available: `sin cos tan asin acos atan sinh cosh tanh exp ln log log2
sqrt abs sign floor ceil round`, plus `pi` and `e`.

There is no `eval` anywhere: this is a recursive-descent parser over a fixed grammar with a fixed
function table, looked up with `Object.hasOwn` so an expression cannot reach `Object.prototype`.
A sign binds looser than a power, so `-x^2` is negative — parsed the other way it is a different
curve, and one that looks perfectly reasonable on screen.

## Marks

| | |
| --- | --- |
| `tangent` | `{"of":"f","at":1}` — slope measured here |
| `area` | `{"of":"f","from":0,"to":2}`, or `{"between":["f","g"],…}` |
| `riemann` | `{"of":"f","from":0,"to":1,"n":8,"rule":"left"\|"right"\|"mid"}` |
| `point` | `{"on":"f","at":1,"label":"P"}` |
| `asymptote` | `{"x":0}` or `{"y":1}` |
| `derivative` | `{"of":"f"}` — the curve of f′, sampled the same way f is |

Not in this version, and the prompt spec tells the model to explain them in prose or use
` ```chart ` instead: implicit curves, polar and parametric curves, surfaces, the complex plane,
and the scatter of a sequence or distribution.

## Options

- `width?`, `height?` — figure size in CSS pixels, default 640 × 380.
- `samples?` — points per curve, default 480.
- `maxCurves?` — default 8. `maxSourceBytes?` — default 16 KiB.

## Testing note

`src/fixtures/` holds the twenty figures a model produced when given this plugin's prompt spec and
twenty textbook questions. They are part of the test suite: a protocol change they stop parsing is
one that breaks answers already being written.

See the [root README](../../README.md) for the full plugin list.
