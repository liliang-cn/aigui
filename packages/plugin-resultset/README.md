# @ai-gui/plugin-resultset

Host-owned result tables for [AIGUI](../../README.md): the numbers in an answer come from the query, not from the model retyping them.

## Why it exists

A model that reads `4624290` out of a tool result and types it into a sentence has introduced a transcription step that nothing checks — and transcription is exactly where a digit goes missing.

[`@ai-gui/plugin-evidence`](../plugin-evidence) proves **which query ran**. It does not prove the number in the prose came from it. This plugin closes that gap from the other side: the host emits the rows verbatim, and the prompt tells the model to point at the table instead of copying out of it.

## Install

```sh
pnpm add @ai-gui/plugin-resultset
```

## Usage

```tsx
import { AIRenderer } from "@ai-gui/react"
import { resultset, resultsetPromptSpec, serializeResultsetFence } from "@ai-gui/plugin-resultset"

<AIRenderer text={answer} plugins={[resultset()]} />
```

**1. Append `resultsetPromptSpec()` to the system prompt:**

```
Never emit a ```resultset fence. The application appends result tables from the rows it really returned.
Do not retype figures from a table into your prose. Refer to the table by id, e.g. [[result:by_region]], and describe what it shows.
```

**2. Append the fence server-side, from the rows you actually got back:**

```ts
const fence = serializeResultsetFence({
  id: "by_region",
  label: "Revenue by region",
  columns: result.columns,
  rows: result.rows,
  source: "warehouse",
  truncated: result.truncated,
})
return answer + "\n\n" + fence
```

## The fence

````markdown
```resultset
{"id":"by_city","label":"Orders by city",
 "columns":["city","orders","amount"],
 "rows":[["Shanghai",2104,4624290],["Beijing",1460,3011880]],
 "source":"shop","truncated":false}
```
````

| field | |
|---|---|
| `columns` / `rows` | required; every row must be exactly as wide as the header |
| `id` | what the prose points at — `[[result:by_city]]` |
| `label` | caption, usually the question this answers |
| `source` | where it ran |
| `truncated` | more rows existed than were returned |

A row that does not match the header is **rejected**, not padded. A misaligned table puts a number under the wrong column, which is worse than no table.

`null` renders as a distinct, muted `null` rather than an empty cell — "we have no value" and "the value is empty" are different findings.

## Options

| option | default | |
|---|---|---|
| `maxRows` | `200` | rows rendered per table (hard cap 500) |
| `showId` | `false` | print the id beside the caption, so prose references are traceable |

## Numbers

Numeric cells are right-aligned, `tabular-nums`, and grouped: `4,624,290`, never `4.62429e+06`. The same figure either way — but only one can be compared with the number below it at a glance, which is the entire job of a column of numbers.

Rows beyond the cap, and `truncated`, are both stated in the footer. A table silently cut to its first page is a wrong answer that looks complete.

## Streaming

Complete-gated, like `plugin-chart` and `plugin-evidence`. A table that grows a row at a time reads, mid-stream, as a table that is already finished: a reader who looks away at the wrong moment sees four rows where there were nine, and nothing tells them so.

## Styling

`resultsetCss` is a plain string of the defaults; the markup carries `data-aigui-resultset*` attributes so you can ignore it entirely. Colours use `color-mix` against `currentColor`, so the table follows the surrounding theme.

## License

MIT
