---
"@ai-gui/image": minor
"@ai-gui/mcp": minor
"@ai-gui/plugin-bigscreen": minor
"@ai-gui/plugin-scene": patch
---

Drawn blocks are looked over for what a reader would trip over — clipped, tiny or low-contrast text, labels on top of each other, crowded panels — and `aigui_render` / `aigui_open` list the problems so the agent can fix them. Plugins flag their own with `data-aigui-issue`.
