# @ai-gui/plugin-ui

Safe, bounded, framework-neutral declarative UI for AIGUI. The plugin accepts one complete `ui` fenced JSON document and mounts semantic DOM without executing generated code.

```ts
import { ui } from "@ai-gui/plugin-ui"

const plugin = ui({ registry, actionRuntime })
```

```ui
{
  "version": 1,
  "id": "service-planner",
  "state": { "service": "short-links", "replicas": 3 },
  "root": {
    "kind": "stack",
    "id": "root",
    "children": [
      { "kind": "heading", "id": "title", "level": 2, "text": "Service planner" },
      {
        "kind": "form",
        "id": "form",
        "submit": { "type": "plan.submit" },
        "children": [
          { "kind": "field", "id": "service", "bind": "service", "fieldType": "text", "label": "Service" },
          { "kind": "field", "id": "replicas", "bind": "replicas", "fieldType": "number", "label": "Replicas" }
        ]
      },
      { "kind": "card", "id": "summary", "type": "plan-summary", "data": { "service": { "$state": "service" }, "replicas": { "$state": "replicas" } } }
    ]
  }
}
```

Supported nodes are `stack`, `grid`, `text`, `heading`, `divider`, `list`, `table`, `keyValue`, `form`, `field`, `button`, and `card`. Actions and cards must be registered by the host. State is flat and scalar, and `{"$state":"key"}` is the only binding syntax.

The plugin rejects unknown fields, unsafe identifiers, unregistered actions/cards, invalid card data, oversized or deeply nested trees, unsafe regular expressions, HTML, CSS, JavaScript, URLs, imports, expressions, loops, workflows, remote components, and artifact commands. Model text is rendered with native DOM APIs and `textContent`.

A rejection is document-wide: one unregistered action name discards the whole block, not just that button. The prompt spec says so, and lists the registered names, so a model with no actions available is told to emit no button and no form.

## Locale and theme

The few strings the plugin draws itself — a field's "required" line, an action's failure line, the line shown in place of a block that will not render — follow the renderer's locale, and the model-facing rules follow the locale passed to `buildSystemPrompt`. English and `zh-CN` ship; anything else falls back to English.

```ts
ui({ registry, actionRuntime })                    // follows the renderer
ui({ registry, actionRuntime, locale: "zh-CN" })   // pinned regardless of host
```

Colour is derived from the inherited text colour, so a block sits on whatever background it is given. The three tone colours cannot be — a critical line that is only a tint of the surrounding text is not a critical line — so they resolve as: a value the host set on `--aigui-ui-positive` / `--aigui-ui-warning` / `--aigui-ui-critical`, then the renderer's `theme`, then the OS preference.

## When an action fails

The reader is told which kind of failure it was, because the answers differ: invalid input to fix, a timeout to retry, a cancelled or unavailable action to stop at. Only the error's *class* is ever read. A message thrown by the host's own action code — a stack, an internal id, a database error — is never shown, on a surface whose shape the model chose.
