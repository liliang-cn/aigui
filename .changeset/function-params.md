---
"@ai-gui/plugin-function": minor
---

A figure may declare parameters the reader can drag.

```json
{
  "params": [{ "id": "a", "from": -3, "to": 3, "value": 1, "step": 0.1 }],
  "plot": [{ "id": "f", "expr": "a*x^2", "domain": [-3, 3] }]
}
```

A slider is looking, not authoring — the same category as turning a solid around in
`plugin-solid` — so it stays inside the line this SDK draws: the conditions are still the model's
and every number on screen is still computed here.

Determinism survives it. A figure with no `params` renders exactly as before, as a plain string,
which is what keeps it server-renderable, exportable and byte-identical between runs. Only a figure
that asks for a slider mounts a live element, and even then each frame is `render(definition,
values)` — a pure function of the definition and one number per parameter, so any slider position is
reproducible from that number alone.

The expression grammar now takes named parameters alongside `x`, and so do interval endpoints and
marks: `"domain": [0, "b"]`, `{"tangent": {"of": "f", "at": "b"}}`. A name that was never declared
still fails at parse time rather than evaluating to NaN on every frame, so a typo surfaces once
rather than silently emptying the figure.
