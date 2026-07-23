# AIGUI Playground Fixtures

This private workspace package keeps the Phase 5 playground lightweight and buildable without a browser bundler. It exports:

- deterministic Markdown, Card, and UTF-8 stream fixtures;
- React, Vue, and Vanilla adapter constructors for smoke tests and local demos;
- `exportReproduction()` and `loadReproduction()` for portable minimal reproduction JSON.

Use `@ai-gui/devtools` with these fixtures to inspect raw chunks, repaired Markdown, AST snapshots, patches, Action state, and CardStore changes. The package is `private` and is never published with the SDK.
