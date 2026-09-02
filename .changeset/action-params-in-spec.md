---
"@ai-gui/core": minor
"@ai-gui/plugin-ui": patch
---

A `ui` block's rules now say what each action *wants*, not just its name.

The spec listed registered actions as bare names while listing every card with its fields. Asked in a real product to draw a form that adds a schedule, a model bound the start time to `when` against an action that required `start_at` — a perfectly reasonable name it had no way to check — and the dispatch was rejected before it reached the host, with the form looking correct on screen.

`ActionRuntime.describeAction(type)` in `@ai-gui/core` returns one action's parameter schema and nothing else. It is deliberately narrower than `registry.get`: a schema is a description, while an `ActionDefinition` carries `run`, and handing that out is handing out the side effect. `@ai-gui/plugin-ui` reads it to print each action as `name: param*(type), …`, the same shape it already used for cards, with `*` marking required — for cards too, since a model that cannot tell required from optional fills in neither or both. The method is optional on the plugin's `UIActionRuntime` interface, so a host passing its own runtime object keeps working.
