import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { readPublicPackages, validateRelease } from "./release-tag.mjs"

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

test("ignores package directories without a manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "aigui-release-"))
  try {
    await mkdir(join(root, "core"))
    await mkdir(join(root, "playground"))
    await writeFile(join(root, "core", "package.json"), JSON.stringify({ name: "@ai-gui/core", version: "0.3.0" }))
    await writeFile(join(root, "playground", "README.md"), "# Playground")

    assert.deepEqual(await readPublicPackages(pathToFileURL(`${root}/`)), [
      { name: "@ai-gui/core", version: "0.3.0", private: undefined },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
