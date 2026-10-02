import { createRequire } from "node:module"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/**
 * Where pictures and pages are written.
 *
 * Not the system temp directory: a page is something a person may reopen tomorrow, and macOS
 * clears `$TMPDIR` on its own schedule. `AIGUI_OUT_DIR` moves it, `XDG_CACHE_HOME` is honoured.
 */
export function outputRoot(env: Record<string, string | undefined> = process.env): string {
  if (env.AIGUI_OUT_DIR) return env.AIGUI_OUT_DIR
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "aigui")
}

/**
 * The built page viewer in this package's `dist/viewer`: `core.js` and one script per pack.
 *
 * Found through the package root rather than beside this module, so the same answer comes back
 * from the built `dist/index.js` and from the source a test imports.
 */
export function viewerDir(): string {
  const manifest = createRequire(import.meta.url).resolve("@ai-gui/mcp/package.json")
  return join(dirname(manifest), "dist", "viewer")
}

/** This package's version, for the server's handshake and the viewer's file name. */
export function packageVersion(): string {
  try {
    return (createRequire(import.meta.url)("@ai-gui/mcp/package.json") as { version: string }).version
  } catch {
    return "0.0.0"
  }
}
