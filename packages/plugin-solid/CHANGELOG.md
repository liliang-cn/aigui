# @ai-gui/plugin-solid

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

### Patch Changes

- @ai-gui/core@0.26.0

## 0.25.0

### Patch Changes

- @ai-gui/core@0.25.0

## 0.24.0

### Minor Changes

- cca2889: New package: solid-geometry teaching figures.

  The model names a solid and the conditions on it — 正方体 ABCD-A1B1C1D1, 过 A、B1、D1 的截面 — and the
  figure is computed from those. Cubes, cuboids, prisms, pyramids, cylinders, cones and spheres;
  points along a segment, at a face centre, at the foot of a perpendicular or on a circle; sections
  through three points, marked lines, planes and angles; `apexOver` for the case where a lateral edge
  is perpendicular to the base. Three.js is imported only when a figure is actually drawn.

  The protocol asks for conditions and never for results. A model asked how many sides a section has
  sometimes says five when it is six, and a figure drawn from that answer would be wrong in a way a
  student cannot see; asked only for the three points the plane passes through, its arithmetic cannot
  reach the picture. Vertex coordinates and unknown fields are refused for the same reason, as is any
  figure naming a point that was never defined — `{"plane": ["P", "A", "B"]}` on a cone is the right
  shape in every field and still meaningless, because a cone has no A or B until `onCircle` puts them
  there.

  The prompt spec was measured rather than guessed: twenty textbook questions through a model, one
  conversation each, three rounds. `src/fixtures/` keeps the nineteen figures the final round
  produced, and they are part of the test suite.

### Patch Changes

- @ai-gui/core@0.24.0
