# @ai-gui/plugin-physics

## 0.10.0

### Minor Changes

- New: force and vector diagrams for teaching mechanics.

  A ```physics block declares bodies, surfaces, vectors and angles, and the plugin draws them as SVG —
  the picture a textbook draws for a block on an incline, with the forces labelled and one of them
  resolved into components.

  It is a drawing, not a simulation. A rigid-body engine produces a collision that looks right and
  gives a teacher no way to label the intermediate quantities, stop at three seconds, or show a force
  in equilibrium that never moves anything. Coordinates in, faithful picture out; the numbers are the
  model's to get right.

  y increases upwards and angles run counter-clockwise from the positive x axis, because that is how a
  mechanics problem states them — "60° above the horizontal", "gravity at -90". Colours come from CSS
  custom properties over currentColor, so a diagram follows the page it is on.

### Patch Changes

- @ai-gui/core@0.10.0
