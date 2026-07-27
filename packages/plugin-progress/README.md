# @ai-gui/plugin-progress

Live progress for a long turn, for [AIGUI](../../README.md). The plugin claims one `progress` fence and draws the steps it declares, several per request, each updated in place.

A model that is going to search, read three sources, then draft spends a long time saying nothing. A host-level "thinking…" covers that, but it is one line for the whole turn: it cannot say which of the four things is happening, which have finished, or that the third one failed.

## Install

```sh
pnpm add @ai-gui/plugin-progress
```

## Usage

```tsx
import { progress, progressCss } from "@ai-gui/plugin-progress"
import { AIRenderer } from "@ai-gui/react"

<style>{progressCss}</style>
<AIRenderer plugins={[progress()]} />
```

One step, or several:

    ```progress
    {"version":1,"steps":[
      {"id":"search","label":"检索资料","state":"done"},
      {"id":"read","label":"阅读来源","state":"running","detail":"第 2/5 篇","percent":40},
      {"id":"draft","label":"撰写讲解","state":"pending"}
    ]}
    ```

## Updating a step

Emit it again with the same `id`:

    ```progress
    {"version":1,"id":"read","label":"阅读来源","state":"done","detail":"5 篇已读"}
    ```

The later block replaces the earlier one, so restating the whole list is fine and does not duplicate rows. This is the part that makes it usable: a streamed answer is append-only, so an update *is* a second block, and without superseding a turn that reported four steps three times would render twelve rows.

Ownership is decided in `onASTCommit`, from the whole node list, so it is right however the host re-parses the turn.

## API

- `progress(options?)` creates the AIGUI plugin.
- `progressPromptSpec(options?)` returns the model-facing protocol description.
- `parseProgress(source, options?)` strictly parses a block.
- `renderProgressHTML(steps)` renders parsed steps.
- `progressCss` contains the package styling.

## Options

- `maxSteps?: number`: per block, default `24`.
- `maxSourceBytes?: number`: default 8 KiB.

States are `pending`, `running`, `done`, `failed` and `skipped`, defaulting to `running`. A percentage is clamped to 0–100 and omitted when the work has no measurable fraction.

Colours come from `currentColor` and `--aigui-progress-*` custom properties. The running marker stops spinning under `prefers-reduced-motion`. Output is marked `trusted` because it is built from parsed data rather than model markup, and labels are escaped.
