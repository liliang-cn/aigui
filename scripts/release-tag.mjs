import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

export function validateRelease(tag, packages) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag)
  if (!match) throw new Error(`Release tag must be strict semver (vX.Y.Z), received: ${tag}`)

  const tagVersion = match.slice(1).join(".")
  const versions = new Set(packages.map((pkg) => pkg.version))
  if (versions.size !== 1) {
    throw new Error(`Public packages must share one version, received: ${[...versions].join(", ")}`)
  }
  if (!versions.has(tagVersion)) {
    throw new Error(`Release tag ${tag} does not match package version ${[...versions][0]}`)
  }
}

export async function readPublicPackages(packageRoot = new URL("../packages/", import.meta.url)) {
  const entries = await readdir(packageRoot, { withFileTypes: true })
  const packages = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const manifest = JSON.parse(await readFile(new URL(`${entry.name}/package.json`, packageRoot), "utf8"))
      return { name: manifest.name, version: manifest.version, private: manifest.private }
    } catch (error) {
      if (error?.code === "ENOENT") return null
      throw error
    }
  }))
  return packages.filter((pkg) => pkg && !pkg.private)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? ""
  validateRelease(tag, await readPublicPackages())
  console.log(`Validated release ${tag}`)
}
