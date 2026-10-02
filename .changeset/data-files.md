---
"@ai-gui/mcp": minor
---

`aigui_render` and `aigui_open` take `data` files (CSV, TSV, JSON); blocks reference them with `{"$data": …}` for rows, a column, picked columns or a total, so the numbers come from the file rather than being retyped.
