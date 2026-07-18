// @vitest-environment jsdom
import { expect, it } from "vitest"
it("has a dom", () => { const d = document.createElement("div"); d.textContent = "hi"; expect(d.textContent).toBe("hi") })
