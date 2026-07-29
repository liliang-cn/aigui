import { useEffect } from "react"
import { injectPluginStyles, type AIGuiPlugin } from "@ai-gui/core"

/**
 * Put the plugins' stylesheets in the document.
 *
 * Plugins declare `css` but have no way to install it themselves, so without this a host has to
 * know which of its plugins ship styles and import each one by hand. Injection is idempotent, so
 * several renderers on a page share one copy of each stylesheet.
 */
export function usePluginStyles(plugins?: AIGuiPlugin[]): void {
  useEffect(() => {
    injectPluginStyles(plugins)
  }, [plugins])
}
