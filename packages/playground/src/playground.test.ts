import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { ADAPTER_FIXTURES, PLAYGROUND_FIXTURES, exportReproduction, loadReproduction } from "./index"

describe("playground fixtures", () => {
  it("constructs React, Vue, and Vanilla demos", () => {
    const dom = new JSDOM("<div id=app></div>")
    const previousDocument = globalThis.document
    Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true })
    const element = dom.window.document.querySelector("#app") as unknown as HTMLElement
    try {
      expect(ADAPTER_FIXTURES.react()).toBeTruthy()
      expect(ADAPTER_FIXTURES.vue()).toBeTruthy()
      const vanilla = ADAPTER_FIXTURES.vanilla(element)
      vanilla.push(PLAYGROUND_FIXTURES.markdown)
      expect(element.textContent).toContain("Streaming demo")
      vanilla.destroy()
    } finally {
      if (previousDocument === undefined) delete (globalThis as { document?: Document }).document
      else Object.defineProperty(globalThis, "document", { value: previousDocument, configurable: true })
    }
  })

  it("exports and reloads a minimal reproduction", () => {
    const input = { adapter: "vue" as const, markdown: PLAYGROUND_FIXTURES.unicode, chunkSize: 3, delayMs: 12 }
    expect(loadReproduction(exportReproduction(input))).toEqual({ version: 1, ...input })
    expect(() => loadReproduction('{"version":1,"adapter":"unknown"}')).toThrow(/invalid/i)
  })
})
