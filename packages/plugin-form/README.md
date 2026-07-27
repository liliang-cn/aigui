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

Supported fields are `text`, `textarea`, `number`, `date`, `select`, `radio`, `checkbox` (one box, yes or no) and `checkboxes` (several answers to one question). Supported constraints are `required`, `minLength`, `maxLength`, `pattern`, `min`, `max`, and — on `checkboxes` — `minSelected` and `maxSelected`.

A question with more than one correct answer is `checkboxes`. Radios exclude each other and a text box makes the person guess the format, so neither can ask it:

````markdown
```form
{
  "id": "replication",
  "fields": [
    {
      "name": "answer",
      "type": "checkboxes",
      "label": "Which protocols wait for the peer?",
      "required": true,
      "options": [
        { "label": "A. Protocol A", "value": "A" },
        { "label": "B. Protocol B", "value": "B" },
        { "label": "C. Protocol C", "value": "C" }
      ],
      "expect": ["B", "C"]
    }
  ],
  "submitAction": "quiz.answer"
}
```
````

Its value is the chosen option values, always in the order the options were declared, so the same answer compares equal to itself however it was clicked. `expect` is the set of every correct option, compared as a set — the order it is written in does not matter. The verdict is `positive` only when the set matches exactly; how much a partly-right answer is worth is a marking scheme, which belongs to the host rather than to the form.

`submitAction` must already exist in the injected `ActionRuntime`. Form JSON rejects unknown properties, HTML, URLs, scripts, event handlers, and dynamic component names. Each mounted form owns its pending state and cancellation scope; adapter teardown aborts only that form's request.
