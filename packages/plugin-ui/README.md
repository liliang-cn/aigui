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
