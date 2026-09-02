/**
 * The plugin's own styling: layout the model asked for, plus the few colours it
 * did not.
 *
 * Structure (stacks, grids, gaps) belongs here because the model chose it, and a
 * host cannot restyle `data-gap="md"` into something else without breaking what
 * the model meant. Appearance mostly does not: borders and muted text are
 * derived from `currentColor` so they sit on whatever background the host has,
 * and the host is expected to dress the rest.
 *
 * The three tone colours cannot be derived that way — a critical line that is
 * only a tint of the surrounding text is not a critical line — so they are
 * tokens with a value for each scheme. They resolve in this order: a value the
 * host set, then the theme the renderer reported, then the OS preference. That
 * last step is the fallback rather than the rule, because a host that paints a
 * dark page while the OS is in light mode is common, and it is the one that
 * told us its theme.
 *
 * Every default below is wrapped in `:where()`, which contributes no
 * specificity, so a host setting `--aigui-ui-critical` wins wherever it writes
 * it. Without that the seam does not exist: this stylesheet is injected when
 * the plugin loads, which is after the host's own has been parsed, so an
 * override written at the same specificity loses on order alone — and the theme
 * default `[data-aigui-ui][data-aigui-ui-theme="dark"]` matches the doubled
 * selector a host would most naturally reach for.
 */
export const uiCss = `
[data-aigui-ui] { display: block; color: inherit; font: inherit; }
:where([data-aigui-ui]) {
  --aigui-ui-positive: #18794e;
  --aigui-ui-warning: #9a6700;
  --aigui-ui-critical: #b42318;
}
@media (prefers-color-scheme: dark) {
  :where([data-aigui-ui]:not([data-aigui-ui-theme="light"])) {
    --aigui-ui-positive: #5cd6a0;
    --aigui-ui-warning: #f0c065;
    --aigui-ui-critical: #ff9086;
  }
}
:where([data-aigui-ui][data-aigui-ui-theme="dark"]) {
  --aigui-ui-positive: #5cd6a0;
  --aigui-ui-warning: #f0c065;
  --aigui-ui-critical: #ff9086;
}
[data-aigui-ui-stack="row"] { display: flex; flex-direction: row; flex-wrap: wrap; }
[data-aigui-ui-stack="column"] { display: flex; flex-direction: column; }
[data-aigui-ui-grid] { display: grid; grid-template-columns: repeat(var(--aigui-ui-columns, 1), minmax(0, 1fr)); }
[data-aigui-ui-grid="2"] { --aigui-ui-columns: 2; }
[data-aigui-ui-grid="3"] { --aigui-ui-columns: 3; }
[data-aigui-ui-grid="4"] { --aigui-ui-columns: 4; }
[data-gap="sm"] { gap: .5rem; } [data-gap="md"] { gap: 1rem; } [data-gap="lg"] { gap: 1.5rem; }
[data-align="start"] { align-items: flex-start; } [data-align="center"] { align-items: center; } [data-align="end"] { align-items: flex-end; } [data-align="stretch"] { align-items: stretch; }
[data-tone="muted"] { color: color-mix(in srgb, currentColor 60%, transparent); }
[data-tone="positive"] { color: var(--aigui-ui-positive); } [data-tone="warning"] { color: var(--aigui-ui-warning); } [data-tone="critical"] { color: var(--aigui-ui-critical); }
[data-aigui-ui] table { border-collapse: collapse; width: 100%; }
[data-aigui-ui] th, [data-aigui-ui] td { border: 1px solid color-mix(in srgb, currentColor 22%, transparent); padding: .4rem .6rem; text-align: left; }
[data-aigui-ui-field] { display: grid; gap: .25rem; }
[data-aigui-ui-field-error], [data-aigui-ui-action-error] { color: var(--aigui-ui-critical); }
[data-aigui-ui-invalid] { color: color-mix(in srgb, currentColor 72%, transparent); }
`
