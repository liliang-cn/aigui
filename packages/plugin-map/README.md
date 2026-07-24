# @ai-gui/plugin-map

Secure, accessible Leaflet maps for AIGUI. The plugin accepts one complete `map` fence containing strict inline JSON. Leaflet is imported only when a browser mount begins, so importing the package in Node is safe.

```bash
pnpm add @ai-gui/core @ai-gui/plugin-map leaflet
```

```ts
import { map } from "@ai-gui/plugin-map"
import "@ai-gui/plugin-map/style.css"

const plugins = [map({ controls: { zoom: true, reset: true, fit: true } })]
```

Vector-only maps are the default and make no network requests. A basemap must be supplied by the host with an exact tile-origin allow-list:

```ts
map({
  basemap: {
    tileUrlTemplate: "https://tiles.example.com/{z}/{x}/{y}.png",
    attribution: { text: "Example tiles", url: "https://example.com/terms" },
  },
  networkPolicy: { allowedTileOrigins: ["https://tiles.example.com"] },
})
```

The model document can contain only inline GeoJSON, markers, routes, labels, descriptions, fixed variants, and an optional initial view. URLs, colors, styles, remote data, tokens, HTML, scripts, callbacks, and arbitrary Leaflet options are rejected.

Public exports include `map`, `mapPromptSpec`, `parseMapDocument`, `validateMapDocument`, `DEFAULT_MAP_LIMITS`, `mapCss`, `mountMapDocument`, document and option types, and validation errors.
