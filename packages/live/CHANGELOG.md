# @ai-gui/live

## 0.36.3

### Patch Changes

- @ai-gui/core@0.36.3

## 0.36.2

### Patch Changes

- @ai-gui/core@0.36.2

## 0.36.1

### Patch Changes

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

### Minor Changes

- d5a4483: A WebSocket client for the card layer, so a backend can drive an AIGUI interface without a frontend project.

  Cards, `ui` documents and actions travel over one socket. The server holds authoritative state and resyncs in full on reconnect, which means recovery uses the same code path as a first connection rather than a separate one that only runs after a failure. Actions fail immediately while disconnected instead of queuing, so a click made against a dead socket is never replayed later. The protocol is specified in `docs/live-protocol.md` and pinned by shared fixtures that any implementation, in any language, can test against.

### Patch Changes

- @ai-gui/core@0.32.0
