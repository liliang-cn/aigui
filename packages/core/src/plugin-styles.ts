import type { AIGuiPlugin } from "./types"

/**
 * The stylesheet every renderer needs regardless of which plugins are loaded.
 *
 * Model output is written without knowing the viewport, so a wide table, a long code line or a
 * diagram sized for a desktop will otherwise push the page sideways on a phone. Each block is
 * made to scroll inside its own box instead of widening the column that holds it.
 */
export const baseCss = [
  "[data-aigui-renderer]{max-width:100%}",
  // Anything intrinsically sized stays inside the column.
  "[data-aigui-renderer] img,[data-aigui-renderer] svg,[data-aigui-renderer] video,[data-aigui-renderer] canvas{max-width:100%;height:auto}",
  // Code scrolls itself rather than stretching the page; long tokens wrap as a last resort.
  "[data-aigui-renderer] pre{max-width:100%;overflow-x:auto}",
  "[data-aigui-renderer] code{overflow-wrap:anywhere}",
  "[data-aigui-renderer] pre code{overflow-wrap:normal}",
  // Tables scroll horizontally in place. `display:block` is what makes overflow apply to a table.
  //
  // Scoped with `:where(...)` so the exclusion adds no specificity: a plugin that wraps its own
  // table in a scrolling container (resultset, dashboard) declares `width:100%` on the table, and
  // `display:block` at equal specificity silently wins the cascade — the shell stays full-width
  // while the rows shrink-wrap to a sliver. That fight was real: hosts had to override this rule
  // by hand before the exclusion existed.
  "[data-aigui-renderer] table:where(:not([data-aigui-resultset] *):not([data-aigui-dashboard] *)){display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}",
  // A URL with no spaces is the usual culprit for a page that scrolls sideways.
  "[data-aigui-renderer] p,[data-aigui-renderer] li,[data-aigui-renderer] h1,[data-aigui-renderer] h2,[data-aigui-renderer] h3{overflow-wrap:break-word}",
  "[data-aigui-renderer] a{overflow-wrap:anywhere}",
  // Plugin widgets (charts, diagrams, maps) declare their own height but must never exceed the
  // width available to them.
  "[data-aigui-renderer] [data-aigui-chart],[data-aigui-renderer] [data-aigui-mermaid],[data-aigui-renderer] [data-aigui-map],[data-aigui-renderer] [data-aigui-molecule]{max-width:100%;overflow-x:auto}",
].join("")

/** One plugin's stylesheet, keyed by the plugin that owns it. */
export interface PluginStyle {
  name: string
  css: string
}

/**
 * Collect the stylesheets of the given plugins, base styles first.
 *
 * Plugins declare `css` but cannot inject it themselves — they never see the document. Each
 * plugin appears once even if it is passed twice, and later plugins of the same name win, which
 * matches how `collectNodeRenderers` resolves duplicates.
 */
export function collectPluginStyles(plugins?: AIGuiPlugin[]): PluginStyle[] {
  const styles = new Map<string, string>()
  styles.set("base", baseCss)
  for (const plugin of plugins ?? []) {
    const css = plugin?.css?.trim()
    if (!css) continue
    // A bare-specifier @import only resolves in a bundler, never in an injected <style>.
    if (css.startsWith("@import") && !/@import\s+url\(|@import\s+["'](?:https?:)?\/\//.test(css)) continue
    styles.set(plugin.name, css)
  }
  return [...styles].map(([name, css]) => ({ name, css }))
}

const STYLE_ATTR = "data-aigui-style"

/**
 * Put the plugins' stylesheets in the document, once each.
 *
 * Called on every render by every renderer on the page, so it must be idempotent: a stylesheet
 * already present is left alone rather than duplicated. No-ops without a document, which is what
 * server-side rendering gets.
 */
export function injectPluginStyles(plugins?: AIGuiPlugin[], doc?: Document): void {
  const target = doc ?? (typeof document === "undefined" ? undefined : document)
  if (!target?.head) return
  for (const { name, css } of collectPluginStyles(plugins)) {
    if (target.querySelector(`style[${STYLE_ATTR}="${CSS_ESCAPE(name)}"]`)) continue
    const el = target.createElement("style")
    el.setAttribute(STYLE_ATTR, name)
    el.textContent = css
    target.head.appendChild(el)
  }
}

/** Quote a plugin name for use inside an attribute selector. */
function CSS_ESCAPE(name: string): string {
  return name.replace(/["\\]/g, "\\$&")
}
