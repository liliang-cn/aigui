export const uiCss = `
[data-aigui-ui] { display: block; color: inherit; font: inherit; }
[data-aigui-ui-stack="row"] { display: flex; flex-direction: row; flex-wrap: wrap; }
[data-aigui-ui-stack="column"] { display: flex; flex-direction: column; }
[data-aigui-ui-grid] { display: grid; grid-template-columns: repeat(var(--aigui-ui-columns, 1), minmax(0, 1fr)); }
[data-aigui-ui-grid="2"] { --aigui-ui-columns: 2; }
[data-aigui-ui-grid="3"] { --aigui-ui-columns: 3; }
[data-aigui-ui-grid="4"] { --aigui-ui-columns: 4; }
[data-gap="sm"] { gap: .5rem; } [data-gap="md"] { gap: 1rem; } [data-gap="lg"] { gap: 1.5rem; }
[data-align="start"] { align-items: flex-start; } [data-align="center"] { align-items: center; } [data-align="end"] { align-items: flex-end; } [data-align="stretch"] { align-items: stretch; }
[data-tone="muted"] { color: color-mix(in srgb, currentColor 60%, transparent); }
[data-tone="positive"] { color: #18794e; } [data-tone="warning"] { color: #9a6700; } [data-tone="critical"] { color: #b42318; }
[data-aigui-ui] table { border-collapse: collapse; width: 100%; }
[data-aigui-ui] th, [data-aigui-ui] td { border: 1px solid currentColor; padding: .4rem .6rem; text-align: left; }
[data-aigui-ui-field] { display: grid; gap: .25rem; }
[data-aigui-ui-field-error], [data-aigui-ui-action-error] { color: #b42318; }
`
