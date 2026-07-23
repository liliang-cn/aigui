# @ai-gui/plugin-form

Safe, framework-neutral interactive forms for AIGUI. React, Vue, and vanilla adapters all host the same DOM mount output.

```ts
import { ActionRegistry, createActionRuntime } from "@ai-gui/core"
import { form } from "@ai-gui/plugin-form"

const actions = new ActionRegistry()
actions.register({
  type: "travel.search",
  schema: {
    type: "object",
    required: ["from"],
    properties: { from: { type: "string" } },
    additionalProperties: false,
  },
  run: (params, { signal }) => searchTravel(params, signal),
})

const plugins = [form({ actionRuntime: createActionRuntime({ registry: actions }) })]
```

The model may emit:

````md
```form
{
  "id": "travel-search",
  "fields": [
    { "name": "from", "type": "text", "label": "From", "required": true },
    { "name": "date", "type": "date", "label": "Departure" }
  ],
  "submitAction": "travel.search",
  "submitLabel": "Search"
}
```
````

Supported fields are `text`, `textarea`, `number`, `date`, `select`, `checkbox`, and `radio`. Supported constraints are `required`, `minLength`, `maxLength`, `pattern`, `min`, and `max`.

`submitAction` must already exist in the injected `ActionRuntime`. Form JSON rejects unknown properties, HTML, URLs, scripts, event handlers, and dynamic component names. Each mounted form owns its pending state and cancellation scope; adapter teardown aborts only that form's request.
