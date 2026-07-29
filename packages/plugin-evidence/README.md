# @ai-gui/plugin-evidence

Query-provenance blocks for [AIGUI](../../README.md): show which statements produced the numbers in an answer.

The point is the ownership. **The host writes this fence, not the model.** A model that can invent a number can invent the query said to have produced it, so evidence written by the model is not evidence — it is more of the same claim. This plugin renders a fence the application appends from what it actually executed.

## Install

```sh
pnpm add @ai-gui/plugin-evidence
```

## Usage

```tsx
import { AIRenderer } from "@ai-gui/react"
import { evidence, evidencePromptSpec, serializeEvidenceFence } from "@ai-gui/plugin-evidence"

<AIRenderer text={answer} plugins={[evidence({ title: "Data provenance" })]} />
```

Two halves, both required:

**1. Tell the model to keep its hands off the fence.** Append `evidencePromptSpec()` to the system prompt:

```
Never emit an ```evidence fence. The application appends it from the queries it really ran.
State numbers you obtained from tool results; do not describe the queries yourself.
```

**2. Append the fence server-side** from the log of what ran:

```ts
const fence = serializeEvidenceFence({
  queries: executed.map(q => ({
    query: q.sql, source: q.database, rows: q.rowCount, ms: q.elapsedMs,
    ok: q.ok, error: q.error,
  })),
})
return answer + "\n\n" + fence
```

## The fence

Fenced JSON, so a partially streamed block is detectably incomplete rather than half-rendered:

````markdown
```evidence
{"queries":[
  {"query":"SELECT count(*) FROM orders","source":"shop","rows":1,"ms":6,"ok":true},
  {"query":"SELECT * FROM missing","ok":false,"error":"no such table"}
]}
```
````

| field | meaning |
|---|---|
| `query` | the statement that ran (required) |
| `label` | human name, e.g. the tool or the question it answered |
| `source` | where it ran — a database or warehouse name |
| `rows` / `ms` | rows returned, wall-clock duration |
| `ok` / `error` | `false` renders the entry as failed, with the reason |

Failed statements are shown, not hidden. A question that took four tries to answer is a different kind of answer than one that took a single query, and the reader deserves to see which they are looking at.

## Options

| option | default | |
|---|---|---|
| `title` | `"Data provenance"` | heading on the disclosure |
| `defaultOpen` | `false` | most readers want the number, not the SQL — until they don't |

The block is a `<details>`, collapsed by default: provenance should be one click away, not in the way.

## Styling

`evidenceCss` is a plain string of the default styles; the markup carries `data-aigui-evidence*` attributes, so you can ignore it and write your own. Colours use `color-mix` against `currentColor`, so the block follows the surrounding theme instead of forcing a light card onto a dark page.

## Streaming

Rendering is complete-gated. While the fence is still arriving, a placeholder shows; the block renders once the closing fence lands. A provenance list that grows a row at a time reads, mid-stream, like a list that is already finished — and a reader who looks away at the wrong moment sees three queries where there were five.

## License

MIT
