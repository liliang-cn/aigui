---
"@ai-gui/plugin-ui": minor
---

`@ai-gui/plugin-ui` now speaks the host's language and says what went wrong.

The strings the plugin draws itself — a field's "required" line, an action's failure line, the line shown in place of a block that will not render — were English regardless of the host, and the model-facing rules ignored the locale the renderer passes every other plugin, so a Chinese product got one English paragraph in the middle of its prompt and English chrome around Chinese content. English and `zh-CN` now ship for both, following the renderer's locale or an explicit `ui({ locale })`.

A failed action used to say "Action failed." whatever happened, from a `safeActionError` whose two branches were the same sentence. It now tells the runtime failures apart, because the reader's next move differs: invalid input to fix, a timeout to retry, a cancelled or unavailable action to stop at. Only the error's class is ever read — a message thrown by the host's own action code is still never shown, on a surface whose shape the model chose.

A refused block names the rule that refused it, rather than reading "Invalid UI." A `UIDocumentError`'s issue is this plugin's own sentence about the document's shape, naming a JSON path and a rule, so it is safe to show and is the only way to tell a typo from a limit. Anything thrown from elsewhere stays unlabelled. The prompt spec also states plainly that one unregistered action name discards the whole block, and tells a model with no actions registered to emit no button and no form.

Colours follow the page: table borders and the refusal line are mixed from the inherited text colour instead of full-strength `currentColor`, and the three tone colours resolve as a host-set `--aigui-ui-positive` / `--aigui-ui-warning` / `--aigui-ui-critical`, then the renderer's `theme`, then the OS preference. The error red was a hardcoded `#b42318`, which is a light-theme red sitting on a dark transcript.
