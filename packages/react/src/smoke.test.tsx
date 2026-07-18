// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { expect, it } from "vitest"

it("renders react in jsdom", () => {
  const { container } = render(<div>hi</div>)
  expect(container.textContent).toBe("hi")
})
