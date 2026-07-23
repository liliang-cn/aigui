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

async function readPublicPackages(root) {
  const packageRoot = new URL("../packages/", root)
  const entries = await readdir(packageRoot, { withFileTypes: true })
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const manifest = JSON.parse(await readFile(new URL(`${entry.name}/package.json`, packageRoot), "utf8"))
    return { name: manifest.name, version: manifest.version, private: manifest.private }
  })).then((packages) => packages.filter((pkg) => !pkg.private))
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? ""
  validateRelease(tag, await readPublicPackages(import.meta.url))
  console.log(`Validated release ${tag}`)
}
