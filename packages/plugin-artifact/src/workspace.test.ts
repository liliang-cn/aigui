// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { ArtifactStore, mountArtifactWorkspace } from "./index"

const command = (id: string, kind: "text" | "code" | "markdown" | "json", content: string, filename = `${id}.txt`) => ({
  version: 1 as const,
  operationId: `create-${id}`,
  artifact: { id, title: id, filename, kind, content, ...(kind === "code" ? { language: "ts" } : {}) },
})

describe("artifact workspace", () => {
  it("preserves selection and tab across updates and supports tab keyboard navigation", () => {
    const store = new ArtifactStore()
    store.create(command("one", "text", "first"))
    store.create(command("two", "code", "second"))
    const host = document.createElement("div")
    const cleanup = mountArtifactWorkspace(host, store)
    host.querySelector<HTMLButtonElement>('[data-artifact-id="two"]')!.click()
    host.querySelector<HTMLButtonElement>('[data-artifact-tab="source"]')!.click()
    store.update({ version: 1, operationId: "update-two", id: "two", baseRevision: 0, content: "changed" })
    expect(host.querySelector('[data-artifact-selected="true"]')?.getAttribute("data-artifact-id")).toBe("two")
    expect(host.querySelector('[data-artifact-tab="source"]')?.getAttribute("aria-selected")).toBe("true")
    expect(host.querySelector("[data-artifact-source]")?.textContent).toBe("changed")
    expect(host.querySelector("[data-artifact-meta]")?.textContent).toContain("two.txt")
    expect(host.querySelector("[data-artifact-meta]")?.textContent).toContain("revision 1")
    expect(host.querySelector("[data-artifact-meta]")?.textContent).toContain("code")
    const source = host.querySelector<HTMLButtonElement>('[data-artifact-tab="source"]')!
    source.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    expect(host.querySelector('[data-artifact-tab="preview"]')?.getAttribute("aria-selected")).toBe("true")
    cleanup(); cleanup()
  })

  it("copies exact content and downloads with Blob/object URL cleanup", async () => {
    const store = new ArtifactStore()
    store.create(command("one", "text", "exact\ncontent", "safe.txt"))
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const createObjectURL = vi.fn(() => "blob:test")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const host = document.createElement("div")
    const cleanup = mountArtifactWorkspace(host, store)
    host.querySelector<HTMLButtonElement>("[data-artifact-copy]")!.click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith("exact\ncontent")
    host.querySelector<HTMLButtonElement>("[data-artifact-download]")!.click()
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    cleanup()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
  })

  it("renders text, code, markdown, and JSON inertly without model innerHTML", () => {
    const store = new ArtifactStore()
    store.create(command("text", "text", '<img src=x onerror="boom">'))
    store.create(command("code", "code", '<script>boom()</script>'))
    store.create(command("markdown", "markdown", '# Title\n<script>boom()</script>\n[ok](https://example.com) [bad](javascript:boom())'))
    store.create(command("json", "json", '{"html":"<img src=x>"}', "data.json"))
    const host = document.createElement("div")
    mountArtifactWorkspace(host, store)
    expect(host.querySelector("img,script")).toBeNull()
    expect(host.querySelector("[data-artifact-preview]")?.textContent).toContain("<img")
    host.querySelector<HTMLButtonElement>('[data-artifact-id="code"]')!.click()
    expect(host.querySelector("script")).toBeNull()
    expect(host.querySelector("[data-artifact-preview]")?.textContent).toContain("<script>")
    host.querySelector<HTMLButtonElement>('[data-artifact-id="markdown"]')!.click()
    expect(host.querySelector("script")).toBeNull()
    expect(host.querySelector('a[href="https://example.com/"]')).toBeTruthy()
    expect(host.querySelector('a[href^="javascript:"]')).toBeNull()
    host.querySelector<HTMLButtonElement>('[data-artifact-id="json"]')!.click()
    expect(host.querySelector("img")).toBeNull()
    expect(host.querySelector("[data-artifact-preview]")?.textContent).toContain("<img src=x>")
  })

  it("unsubscribes and clears mounted DOM idempotently", () => {
    const store = new ArtifactStore()
    store.create(command("one", "text", "one"))
    const host = document.createElement("div")
    const cleanup = mountArtifactWorkspace(host, store)
    cleanup(); cleanup()
    expect(host.childNodes).toHaveLength(0)
    store.update({ version: 1, operationId: "after", id: "one", baseRevision: 0, content: "after" })
    expect(host.childNodes).toHaveLength(0)
  })
})
