// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { h } from "vue"
import { expect, it } from "vitest"
it("mounts vue in jsdom", () => {
  const w = mount({ render: () => h("div", "hi") })
  expect(w.text()).toBe("hi")
})
