# @ai-gui/plugin-motion

## 0.39.0

### Patch Changes

- @ai-gui/core@0.39.0

## 0.38.0

### Patch Changes

- @ai-gui/core@0.38.0

## 0.37.1

### Patch Changes

- @ai-gui/core@0.37.1

## 0.37.0

### Patch Changes

- @ai-gui/core@0.37.0

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

### Minor Changes

- ce488d3: New package: mechanics motion figures.

  Projectiles, free fall, uniform acceleration, simple harmonic motion, circular motion and
  one-dimensional collisions. The model gives the initial conditions; the trajectory, the strobe
  marks and the numbers underneath are computed from closed forms. Plain SVG, no runtime dependency
  beyond core.

  Stroboscopic rather than animated, deliberately. Equal time intervals mean the spacing between
  marks is what shows the acceleration — growing under gravity, shrinking under braking, bunching at
  the turning points of an oscillation — which is the lesson a textbook figure carries. It also keeps
  the figure a pure function of its definition, so it renders identically on a server, in a test and
  in a browser. A rigid-body engine would have answered a slightly different question than the
  idealised one a problem asks, drifting in energy and jittering at rest.

  Three places the arithmetic is easy to get wrong and is done here instead: a projectile launched
  above the ground solves the quadratic rather than using `v²sin2θ/g`, which assumes it lands where it
  started; a braking body stops when it reaches rest instead of reversing through it; and an elastic
  collision is solved from momentum and energy together rather than from momentum alone.

  Measured before it was built: twenty textbook questions through a model, one conversation each, and
  the spec passed in a single round. Horizontal projection came back as `angle: 0`, vertical as
  `angle: 90` and braking as a negative acceleration — the three conventions easiest to invert.

### Patch Changes

- @ai-gui/core@0.27.0
