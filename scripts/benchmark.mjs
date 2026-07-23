import { performance } from "node:perf_hooks"
import { Renderer } from "../packages/core/dist/index.js"

const sizes = [5_000, 20_000]
const chunkSizes = [16, 128, 1024]

for (const size of sizes) {
  const source = `${"Paragraph with **streaming markdown** and `code`.\n\n".repeat(Math.ceil(size / 50))}`.slice(0, size)
  for (const chunkSize of chunkSizes) {
    let patches = 0
    const renderer = new Renderer({ onPatch: (next) => { patches += next.length } })
    const started = performance.now()
    for (let offset = 0; offset < source.length; offset += chunkSize) {
      renderer.push(source.slice(offset, offset + chunkSize))
    }
    const elapsed = performance.now() - started
    const throughput = Math.round(source.length / elapsed)
    console.log(`${size} bytes, ${chunkSize} byte chunks: ${elapsed.toFixed(1)} ms, ${throughput} bytes/ms, ${patches} patches`)
  }
}
