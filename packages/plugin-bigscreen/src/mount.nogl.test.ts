// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { mountScreen } from "./mount"
import type { ScreenDefinition } from "./types"

/**
 * The wall on a page that never installed the optional peer.
 *
 * `echarts-gl` is optional, so the three panels that need it have to say so in one line and leave
 * the rest of the wall alone — not throw, not blank the panel, not take the screen down with them.
 * The import is mocked to fail because that is exactly what a missing package does.
 */
vi.mock("echarts-gl", () => {
  throw new Error("Cannot find module 'echarts-gl'")
})

const screen = (panels: unknown[]): ScreenDefinition => ({ theme: "dark", columns: 12, panels: panels as ScreenDefinition["panels"] })

describe("without echarts-gl", () => {
  it("says what a graph3d panel needs, and leaves the panel beside it alone", async () => {
    const host = document.createElement("div")
    const destroy = mountScreen(
      host,
      screen([
        { kind: "graph3d", nodes: [{ id: "a", name: "A", type: "place" }], edges: [] },
        { kind: "kpi", value: 42 },
      ]),
      false,
    )
    await vi.waitFor(() => expect(host.querySelector(".aigui-bs-note")?.textContent).toBe("Knowledge graph panels need echarts-gl and WebGL."))
    // The note replaces the panel's body, legend and all; the KPI beside it still has its number.
    expect(host.querySelector(".aigui-bs-graph-legend")).toBeNull()
    expect(host.querySelector(".aigui-bs-kpi-value")?.textContent).toBe("42")
    destroy()
  })

  it("still says it for a globe, which is the note this one was modelled on", async () => {
    const host = document.createElement("div")
    const destroy = mountScreen(host, screen([{ kind: "globe", points: [{ coord: [0, 0] }] }]), false)
    await vi.waitFor(() => expect(host.querySelector(".aigui-bs-note")?.textContent).toBe("Globe panels need echarts-gl and WebGL."))
    destroy()
  })
})
