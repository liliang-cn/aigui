export function mapPromptSpec(): string {
  return [
    "Maps (one complete fenced block maximum): ```map <strict MapDocument JSON>```.",
    'MapDocument is exact: {"version":1,"ariaLabel"?:string,"view"?:{"center":[lon,lat],"zoom":0..22},"layers":[...]}.',
    "Use maps, rather than ECharts, for inline GeoJSON, markers, routes, and user map navigation.",
    "Layers are exact geojson FeatureCollections, marker items, or route coordinates; variants are default, accent, muted, positive, warning, or critical.",
    "The model controls data only. The host controls navigation controls, basemap, and network policy.",
    "Never include tile URLs, tokens, remote GeoJSON, geocoding, HTML, scripts, CSS, style expressions, images, callbacks, options, colors, or network fields.",
  ].join("\n")
}
