# @ai-gui/plugin-artifact

Secure, framework-neutral artifact commands and a native DOM workspace for AIGUI.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/plugin-artifact
```

## Usage

```ts
import { ArtifactStore, artifact } from "@ai-gui/plugin-artifact"

const store = new ArtifactStore()
const plugins = [artifact({ store })]
```

The model may create or fully replace artifact content through closed JSON fences. Mutations are applied synchronously in `onASTCommit`, before adapter patches are dispatched.

````markdown
```artifact-create
{
  "version": 1,
  "operationId": "create-readme-1",
  "artifact": {
    "id": "readme",
    "title": "Read me",
    "filename": "README.md",
    "kind": "markdown",
    "content": "# Hello"
  }
}
```

```artifact-update
{
  "version": 1,
  "operationId": "update-readme-1",
  "id": "readme",
  "baseRevision": 0,
  "content": "# Updated"
}
```
````

## Security

- Strict JSON with unknown-key and dangerous-key rejection.
- Safe bounded IDs, operation IDs, titles, filenames, languages, artifact count, per-artifact bytes, and total bytes.
- Exact revision conflicts and canonical operation-receipt idempotency.
- Immutable frozen records and atomically validated snapshots.
- No model delete command, actions, components, network requests, filesystem access, or code execution.
- Text and code use `textContent`; Markdown uses a small inert DOM renderer with HTTPS-only links; JSON preview is bounded.
- Invalid command UI is generic and never reflects model input or detailed parser issues.
- The module is safe to import without browser globals. DOM is accessed only when mounting a workspace.

## Exports

- `ArtifactStore`
- `artifact(options?)`
- `artifactPromptSpec(store?)`
- `parseArtifactCreate(source)` and `parseArtifactUpdate(source)`
- `serializeArtifactCreate(command)` and `serializeArtifactUpdate(command)`
- `mountArtifactWorkspace(host, store)`
- `artifactCss`
- Artifact commands, records, receipts, snapshots, options, results, listener types, and errors
