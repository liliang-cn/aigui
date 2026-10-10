# @ai-gui/plugin-topology

## 0.49.0

### Minor Changes

- 946d5bd: Pictures stay readable, and can be zoomed and saved.

  - `@ai-gui/plugin-topology`: a topology is never shrunk past the scale its smallest text can be read at (0.82); wider than that, the page scrolls it sideways and a picture of it grows wider. A stated `direction` gives way to the other one when it would shrink the text past that and the other is clearly larger. Step numbers keep off nodes and their state badges.
  - `@ai-gui/image`: `exportBlock(url, { block })` draws one block of a page as a PNG; a block drawn wider than the page widens the picture instead of being cut off.
  - `@ai-gui/mcp`: every picture on a page gets a bar — zoom out, zoom level (press to reset), zoom in, full screen, save as PNG. On a page the session serves, Save draws the block at 2× in the headless browser, so charts, 3D and topologies all save as they look; from disk it saves what the browser can.

### Patch Changes

- @ai-gui/core@0.49.0

## 0.48.0

### Patch Changes

- @ai-gui/core@0.48.0

## 0.47.0

### Patch Changes

- @ai-gui/core@0.47.0

## 0.46.0

### Patch Changes

- 1e1636f: `aigui_export` records a page playing as a GIF (encoded in-process) or a WebM; players restart at step 1 for the recording, on an `aigui:restart` event.
  - @ai-gui/core@0.46.0

## 0.45.0

### Patch Changes

- 5cc3c4d: Pages default to English with a `locale` option on `aigui_open` / `aigui_edit`. A KPI without `decimals` keeps the value's own precision, and the gauge reading no longer sits on its scale. A topology without a direction picks the one that draws larger; state badges and link labels no longer collide with the links. Examples use generic names.
  - @ai-gui/core@0.45.0

## 0.44.0

### Minor Changes

- 486b26c: New `topology` block: infrastructure diagrams laid out automatically, with steps that play a process — messages travelling, states changing — in the page, and are numbered on one picture in a PNG. The page check no longer waits forever on a page that animates, and flags labels drawn on top of each other.

### Patch Changes

- @ai-gui/core@0.44.0
