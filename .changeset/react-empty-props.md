---
"@ai-gui/react": patch
---

Render elements that carry no props, instead of silently degrading the whole tree to plain text.

Introduced in 0.29.1 by the `defaultOpen` fix. `toReactProps` starts with
`Object.keys(props)`, but `props` is optional in `RenderOutput` — and that is how
plugins write an element with no attributes: `element("ol", undefined, …)`,
`element("summary", undefined, …)`. The spread it replaced, `{ key, ...out.props }`,
swallowed `undefined` quietly, so nothing here had to think about it.

`Object.keys(undefined)` throws. And the throw is **invisible**: the renderer catches
it and falls back to plain text, so a fence whose plugin emits one bare element stops
being parsed and shows up as its raw JSON where the table should be. No console error,
no warning.

Symptom and cause sit far apart: the published `plugin-resultset` and
`plugin-evidence` dists are byte-identical between 0.29.0 and 0.29.1, and so is
`core`'s. Reading the diff does not get you there — driving a browser does.

The added test watches the whole tree rather than the one attribute: a
`<details open="">` with two prop-less children, all three of which must be present.
The two tests shipped in 0.29.1 only exercised the element that had props, which is
why they were green.
