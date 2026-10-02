---
"@ai-gui/plugin-highlight": minor
---

Code in a language outside `langs` is highlighted too: the plugin loads a grammar Shiki bundles the first time a block names it, instead of setting the block as plain text. `loadOnDemand: false` keeps the old behaviour.
