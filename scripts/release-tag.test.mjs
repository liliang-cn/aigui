import assert from "node:assert/strict"
import test from "node:test"
import { validateRelease } from "./release-tag.mjs"

const packages = [{ name: "@ai-gui/core", version: "0.1.0" }, { name: "@ai-gui/react", version: "0.1.0" }]

test("accepts a strict semver tag matching every public package", () => {
  assert.doesNotThrow(() => validateRelease("v0.1.0", packages))
})

test("rejects loose or prerelease tags", () => {
  for (const tag of ["0.1.0", "v0.1", "v01.1.0", "v0.1.0-beta.1"]) {
    assert.throws(() => validateRelease(tag, packages), /strict semver/)
  }
})

test("rejects package version drift", () => {
  assert.throws(() => validateRelease("v0.1.0", [...packages, { name: "@ai-gui/vue", version: "0.2.0" }]), /share one version/)
})

test("rejects a tag that differs from package versions", () => {
  assert.throws(() => validateRelease("v0.2.0", packages), /does not match/)
})
