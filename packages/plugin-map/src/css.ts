export const mapCss = `
[data-aigui-map]{display:block;max-width:100%}
[data-aigui-map-canvas]{position:relative;width:100%;height:var(--aigui-map-height,360px);min-height:240px;overflow:hidden;background:#e8edf1;outline:none}
[data-aigui-map-canvas]:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
[data-aigui-map-controls]{position:absolute;z-index:800;top:10px;right:10px;display:flex;gap:8px;flex-wrap:wrap}
[data-aigui-map-controls] button{min-width:44px;min-height:44px;border:1px solid #64748b;border-radius:6px;background:#fff;color:#111827;font:inherit;padding:8px 12px;cursor:pointer}
[data-aigui-map-summary]{margin-top:12px}
.leaflet-pane,.leaflet-tile,.leaflet-marker-icon,.leaflet-marker-shadow,.leaflet-tile-container,.leaflet-pane>svg,.leaflet-pane>canvas,.leaflet-zoom-box,.leaflet-image-layer,.leaflet-layer{position:absolute;left:0;top:0}
.leaflet-container{overflow:hidden;-webkit-tap-highlight-color:transparent}.leaflet-container img,.leaflet-container svg{max-width:none!important;max-height:none!important}.leaflet-tile{visibility:hidden}.leaflet-tile-loaded{visibility:inherit}.leaflet-zoom-animated{transform-origin:0 0}.leaflet-zoom-hide{visibility:hidden}.leaflet-control-container{position:relative;z-index:800}.leaflet-control{position:relative;z-index:800;pointer-events:auto}.leaflet-top,.leaflet-bottom{position:absolute;z-index:1000;pointer-events:none}.leaflet-top{top:0}.leaflet-right{right:0}.leaflet-bottom{bottom:0}.leaflet-left{left:0}.leaflet-control-zoom a{display:block;width:44px;height:44px;line-height:44px;text-align:center;background:#fff;color:#111;text-decoration:none}.leaflet-tooltip{position:absolute;padding:6px;background:#fff;border:1px solid #64748b;border-radius:4px;color:#111;white-space:nowrap;pointer-events:none}
@media (prefers-reduced-motion:reduce){[data-aigui-map] *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`
