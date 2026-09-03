# @ai-gui/plugin-optics

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3

## 0.36.2

### Patch Changes

- @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

- 6183537: A refused block now says why, and bigscreen says how long its strings may be.

  Two faults, found by asking a real agent for a real dashboard — a portfolio
  wall — and getting a grey bar.

  **The wall was refused for a caption.** `parseKpi` allows a `label` of 40
  characters and the prompt spec listed the field with no hint of that, or of
  what the field is for. Asked for holdings, the model wrote

      "持仓 14股 | 成本 $699.19 | 现价 $703.41 | 盈亏 +$59.07 (+0.60%)"

  — 54 characters, and lost the whole screen. It did it again on the next
  generation, so this is not luck; it is a limit that was enforced and never
  stated. The spec now gives every length (unit 16, prefix 8, label and rank
  names 40, panel title 80, screen title 80, subtitle 120), says what `label` is
  for, and says the part that makes lengths matter: overrunning one throws the
  whole block away rather than trimming the string.

  The parser's messages carry the numbers too. "must be a short string" is true
  and useless — it tells neither a model rewriting its block nor a person reading
  the message whether they are two characters over or twenty. It now reads
  `panels[0].label must be at most 40 characters (got 54)`.

  **And the reason was invisible.** Seven plugins shipped

      [data-aigui-<name>-error] { …; opacity: .8; background: currentColor }

  which paints the box in the very colour its text is written in. The message
  reached the DOM and the `aria-label`, and on screen it was an unexplained slab —
  indistinguishable from a renderer that had broken. It is now a tint of the host's
  own colour with the text readable over it, in the shape `@ai-gui/plugin-dashboard`
  already used. Wrapped in `:where()` so a host restyling it wins without a
  specificity fight, since plugin CSS is injected at runtime and takes every tie.

  - @ai-gui/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [312391d]
  - @ai-gui/core@0.36.0

## 0.35.2

### Patch Changes

- @ai-gui/core@0.35.2

## 0.35.1

### Patch Changes

- @ai-gui/core@0.35.1

## 0.35.0

### Patch Changes

- @ai-gui/core@0.35.0

## 0.34.0

### Patch Changes

- @ai-gui/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.33.0

## 0.32.0

### Patch Changes

- @ai-gui/core@0.32.0

## 0.31.0

### Patch Changes

- @ai-gui/core@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies
  - @ai-gui/core@0.30.0

## 0.29.2

### Patch Changes

- @ai-gui/core@0.29.2

## 0.29.1

### Patch Changes

- @ai-gui/core@0.29.1

## 0.29.0

### Patch Changes

- Updated dependencies [893cb1e]
  - @ai-gui/core@0.29.0

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
