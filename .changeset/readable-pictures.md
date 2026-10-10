---
"@ai-gui/plugin-topology": minor
"@ai-gui/image": minor
"@ai-gui/mcp": minor
---

Pictures stay readable, and can be zoomed and saved.

- `@ai-gui/plugin-topology`: a topology is never shrunk past the scale its smallest text can be read at (0.82); wider than that, the page scrolls it sideways and a picture of it grows wider. A stated `direction` gives way to the other one when it would shrink the text past that and the other is clearly larger. Step numbers keep off nodes and their state badges.
- `@ai-gui/image`: `exportBlock(url, { block })` draws one block of a page as a PNG; a block drawn wider than the page widens the picture instead of being cut off.
- `@ai-gui/mcp`: every picture on a page gets a bar — zoom out, zoom level (press to reset), zoom in, full screen, save as PNG. On a page the session serves, Save draws the block at 2× in the headless browser, so charts, 3D and topologies all save as they look; from disk it saves what the browser can.
