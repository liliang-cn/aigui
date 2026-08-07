# @ai-gui/plugin-optics

## 0.28.0

### Patch Changes

- @ai-gui/core@0.28.0

## 0.27.0

### Patch Changes

- @ai-gui/core@0.27.0

## 0.26.0

### Minor Changes

- 58b9df1: New package: ray-optics teaching figures.

  The model names the element and the object; the image position, the three characteristic rays, the
  refraction angle and whether the light escapes at all are computed here from `1/u + 1/v = 1/f` and
  Snell's law. Output is a plain SVG string with no runtime dependency beyond core.

  The conclusion under the figure is generated rather than quoted, which is what this plugin adds over
  the other two. Where the image lands is one thing a model gets wrong; writing "倒立、缩小、实像" under a
  figure whose image is upright and enlarged is worse, because that sentence is what a reader takes
  away and nothing checks it. Computed from the same numbers the rays are drawn from, it cannot
  disagree with them — and a model caption that says otherwise is contradicted in place. The protocol
  refuses a definition carrying `imageDistance`, `magnification` or `refractionAngle` outright.

  The sign convention is enforced rather than assumed: a question quotes "a concave lens of focal
  length 12 cm" as a magnitude, and a diverging element drawn with a positive focal length converges,
  which is the opposite figure. A mirror's real image forms in front of it while a lens forms one
  behind, and getting that backwards puts the image on the wrong side of a figure that otherwise looks
  entirely reasonable.

  Measured before it was built: twenty textbook questions through a model, one conversation each. The
  spec passed in a single round with nothing changed — the sign convention was written correctly every
  time. The one thing the probe changed was the design above, after the only rejection turned out to
  be a caption stating a conclusion rather than a field.

### Patch Changes

- @ai-gui/core@0.26.0
