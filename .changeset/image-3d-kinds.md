---
"@ai-gui/image": minor
"@ai-gui/openclaw": minor
---

`@ai-gui/image` now draws four more block families — ` ```scene `, ` ```gravity `, ` ```bigscreen ` and ` ```molecule ` — so a picture-only channel gets the 3D scene, the orbit, the data wall and the molecule as PNGs. The WebGL ones render through SwiftShader in headless Chromium (the launcher now passes the flags that enable it), the animated ones are drawn at their finished state, and the page waits for a canvas to paint before it screenshots. `@ai-gui/openclaw` accepts the four new names in `blocks` and draws them by default.
