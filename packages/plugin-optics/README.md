# @ai-gui/plugin-optics

Ray-optics teaching figures for [AIGUI](../../README.md). The model names the element and the
object; the image, the rays and the conclusion are computed here.

## Install

```sh
pnpm add @ai-gui/plugin-optics
```

No runtime dependency beyond `@ai-gui/core`. The output is an SVG string.

## Usage

```tsx
import { optics } from "@ai-gui/plugin-optics"
<AIRenderer plugins={[optics()]} />
buildSystemPrompt({ registry, plugins: [optics()], locale: "zh-CN" })
```

````markdown
```optics
{
  "element": "convex-lens",
  "focal": 10,
  "object": { "distance": 30, "height": 4, "label": "AB" },
  "caption": "物距大于二倍焦距时的成像"
}
```
````

## The conclusion is generated, not quoted

This is what makes this plugin different from the other figure plugins. Where the image lands is
one thing a model gets wrong; writing **“倒立、缩小、实像”** under a figure where the image is upright
and enlarged is worse, because that sentence is what a reader takes away and nothing checks it.

The plugin computes `v` and the magnification, so it writes that line itself:

> 正立、放大、虚像（像距 15，放大率 2.5）

It comes from the same numbers the rays are drawn from, so the two cannot disagree. A model caption
that says otherwise is contradicted in place rather than quietly believed — and the protocol asks
the model not to state the result at all, refusing a definition that carries `imageDistance`,
`magnification` or `refractionAngle`.

## Sign convention

Light travels left to right; the element sits at the origin; the object is on the left and its
`distance` is positive. A **converging** element (convex lens, concave mirror) has a **positive**
`focal`; a **diverging** one (concave lens, convex mirror) a **negative** one — and the wrong sign
is refused rather than drawn, because a question quotes “焦距 12 cm” as a magnitude and a diverging
element drawn with a positive focal length converges, which is the opposite figure.

A mirror sends light back the way it came, so its real image forms **in front** of it while a lens
forms one behind. Getting that backwards puts the image on the wrong side of a figure that
otherwise looks entirely reasonable.

## Supported

| | |
| --- | --- |
| Imaging | `convex-lens`, `concave-lens`, `concave-mirror`, `convex-mirror`, `plane-mirror` |
| Rays | the three characteristic rays, constructed from the rules rather than from the answer; virtual extensions dashed |
| Refraction | `interface` with `media: [n1, n2]` and an `incidence` angle — Snell's law, with total internal reflection detected and the critical angle reported |

Not in this version, and the prompt spec tells the model to explain them in prose: more than one
element, prisms and dispersion, interference, diffraction, polarisation, aberration, and repeated
reflection in a fibre.

## Testing note

`src/fixtures/` holds the figures a model produced when given this plugin's prompt spec and twenty
textbook questions. They are part of the test suite.

See the [root README](../../README.md) for the full plugin list.
