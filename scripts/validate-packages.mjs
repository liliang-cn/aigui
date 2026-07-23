import { execFileSync } from "node:child_process"
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const packagesRoot = join(root, "packages")
const temp = await mkdtemp(join(tmpdir(), "aigui-pack-"))

try {
  const directories = (await readdir(packagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))

  for (const directory of directories) {
    try { await access(join(directory, "package.json")) } catch { continue }
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
    if (manifest.private) continue

    execFileSync("pnpm", ["exec", "publint", directory], { cwd: root, stdio: "inherit" })
    const output = execFileSync("pnpm", ["pack", "--pack-destination", temp], { cwd: directory, encoding: "utf8" }).trim()
    const packedOutput = output.split(/\r?\n/).at(-1)
    const tarball = resolve(temp, packedOutput)
    const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split(/\r?\n/)

    const importTarget = manifest.exports["."].import.default
    const requireTarget = manifest.exports["."].require.default
    const typeTargets = [manifest.exports["."].import.types, manifest.exports["."].require.types]
    for (const target of [importTarget, requireTarget, ...typeTargets]) {
      const packedPath = `package/${target.replace(/^\.\//, "")}`
      if (!entries.includes(packedPath)) throw new Error(`${manifest.name} tarball is missing ${target}`)
    }

    const unpacked = join(temp, manifest.name.replace("@ai-gui/", ""))
    await mkdir(unpacked)
    execFileSync("tar", ["-xzf", tarball, "-C", unpacked])
    await symlink(join(directory, "node_modules"), join(unpacked, "node_modules"), "dir")
    const packedRoot = join(unpacked, "package")
    await import(pathToFileURL(join(packedRoot, importTarget)).href)
    createRequire(import.meta.url)(join(packedRoot, requireTarget))
    console.log(`Validated packed exports for ${manifest.name}`)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
