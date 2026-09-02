# @ai-gui/plugin-motion

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
