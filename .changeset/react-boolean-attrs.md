---
"@ai-gui/react": patch
---

Honour HTML boolean attributes in the React adapter, so `defaultOpen` opens.

`evidence({ defaultOpen: true })` rendered a collapsed block. The plugin emits
`open: ""` — attribute-*presence* semantics, which is what the DOM and the vanilla
adapter want. React reads props as *values*, and an empty string is falsy, so it
dropped the attribute entirely. Nothing threw and nothing warned; the block was
simply closed, and the option looked like it did nothing.

Normalised in the adapter rather than in the plugin: translating a
framework-neutral `RenderOutput` into React's conventions is the adapter's job,
and the next plugin to emit `disabled: ""` or `checked: ""` would otherwise hit
the same silence. Only presence attributes are affected — `data-x=""` keeps its
empty string, since that is a real value a `[data-x=""]` selector matches.
