/**
 * The bar a picture block carries on the page: zoom out, the zoom level (press to reset), zoom
 * in, full screen, save as PNG. It is what a dense diagram needs to be read, and what a picture
 * needs to leave the page.
 *
 * A block gets the bar the first time the pointer reaches it, if it holds a picture worth
 * zooming: an SVG, a canvas or an image at least 160 px wide. Zooming wraps the block's content
 * once, so a block never zoomed is left exactly as its plugin drew it.
 */

const STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4]

const CSS = [
  "#aigui-root>[data-aigui-has-tools]{position:relative}",
  "[data-aigui-tools]{position:absolute;top:6px;right:6px;z-index:20;display:flex;gap:2px;padding:2px;border:1px solid var(--rule,#d4d4d8);border-radius:7px;background:var(--bg,#fff);box-shadow:0 2px 8px rgba(0,0,0,.08);opacity:0;transition:opacity .12s;font:12px/1 system-ui,sans-serif}",
  "#aigui-root>[data-aigui-has-tools]:hover>[data-aigui-tools],[data-aigui-tools]:focus-within,[data-aigui-zoomed]>[data-aigui-tools],:fullscreen>[data-aigui-tools]{opacity:1}",
  "@media (hover:none){[data-aigui-tools]{opacity:1}}",
  "[data-aigui-tools] button{font:inherit;min-width:26px;height:24px;padding:0 6px;border:0;border-radius:5px;background:transparent;color:var(--fg,#111);cursor:pointer}",
  "[data-aigui-tools] button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}",
  "[data-aigui-tools] button:focus-visible{outline:2px solid #0ea5e9;outline-offset:1px}",
  "[data-aigui-tools] button:disabled{opacity:.35;cursor:default}",
  "[data-aigui-tools] [data-level]{min-width:44px;font-variant-numeric:tabular-nums}",
  "[data-aigui-zoomed]{overflow:auto;max-height:85vh;overscroll-behavior:contain}",
  "[data-aigui-zoomed]>[data-aigui-zoom]{cursor:grab}",
  "[data-aigui-panning]>[data-aigui-zoom]{cursor:grabbing;user-select:none}",
  ":fullscreen[data-aigui-has-tools]{background:var(--bg,#fff);overflow:auto;max-height:none;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}",
  "@media print{[data-aigui-tools]{display:none}}",
].join("")

export interface ToolbarOptions {
  /** The page's colour scheme, so a saved picture matches what the reader sees. */
  theme: "light" | "dark"
  /** Whether the agent's page server can draw a block itself (`/ping` says `snapshot`). */
  canSnapshot: boolean
}

/** The largest SVG, canvas or image in a block, if it is big enough to want a bar. */
function pictureIn(block: Element): Element | undefined {
  let best: Element | undefined
  let bestArea = 0
  for (const el of Array.from(block.querySelectorAll("svg, canvas, img"))) {
    if (el.closest("[data-aigui-tools]") || el.parentElement?.closest("svg")) continue
    const box = el.getBoundingClientRect()
    if (box.width < 160 || box.height < 60) continue
    if (box.width * box.height > bestArea) {
      best = el
      bestArea = box.width * box.height
    }
  }
  return best
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.textContent = label
  b.title = title
  b.setAttribute("aria-label", title)
  b.onclick = (event) => {
    event.stopPropagation()
    onClick()
  }
  return b
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

/** An SVG with the page's computed paint written into it, so it draws the same on its own. */
function standaloneSvg(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const props = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"]
  const source = [svg, ...Array.from(svg.querySelectorAll("*"))]
  const target = [copy, ...Array.from(copy.querySelectorAll("*"))]
  source.forEach((el, i) => {
    const style = getComputedStyle(el)
    const out = target[i] as SVGElement | undefined
    if (!out) return
    out.setAttribute("style", props.map((p) => `${p}:${style.getPropertyValue(p)}`).join(";"))
  })
  const box = svg.getBoundingClientRect()
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  if (!copy.getAttribute("width")) copy.setAttribute("width", String(Math.round(box.width)))
  if (!copy.getAttribute("height")) copy.setAttribute("height", String(Math.round(box.height)))
  return new XMLSerializer().serializeToString(copy)
}

/** What the browser itself can save: a block that is one canvas or one SVG, nothing else. */
async function pictureBlob(picture: Element, block: Element): Promise<Blob | undefined> {
  const pic = picture.getBoundingClientRect()
  const whole = block.getBoundingClientRect()
  // A block whose picture is only part of it (HTML boxes over an SVG of lines) cannot be saved
  // from here without losing the rest; the page server draws those.
  if (pic.width * pic.height < 0.6 * whole.width * whole.height) return undefined
  if (picture instanceof HTMLCanvasElement) {
    return new Promise((resolve) => {
      try {
        picture.toBlob((b) => resolve(b ?? undefined), "image/png")
      } catch {
        resolve(undefined)
      }
    })
  }
  if (picture instanceof SVGSVGElement) {
    const text = standaloneSvg(picture)
    const image = new Image()
    image.src = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }))
    await image.decode().catch(() => undefined)
    const scale = 2
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(pic.width * scale))
    canvas.height = Math.max(1, Math.round(pic.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(image.src)
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), "image/png"))
  }
  if (picture instanceof HTMLImageElement) {
    return fetch(picture.src).then((r) => r.blob()).catch(() => undefined)
  }
  return undefined
}

function fileName(index: number): string {
  const page = decodeURIComponent(location.pathname.split("/").pop() ?? "page").replace(/\.html?$/i, "")
  return `${page}-block-${index}.png`
}

function attach(root: HTMLElement, block: HTMLElement, picture: Element, options: ToolbarOptions) {
  block.setAttribute("data-aigui-has-tools", "")
  const bar = document.createElement("div")
  bar.setAttribute("data-aigui-tools", "")
  bar.setAttribute("role", "toolbar")
  bar.setAttribute("aria-label", "Picture")

  let level = STEPS.indexOf(1)
  let content: HTMLElement | undefined
  const levelButton = button("100%", "Reset zoom", () => setLevel(STEPS.indexOf(1)))
  levelButton.setAttribute("data-level", "")
  const out = button("−", "Zoom out", () => setLevel(level - 1))
  const into = button("+", "Zoom in", () => setLevel(level + 1))

  // The block's own children move into one wrapper the first time it is zoomed.
  const wrap = (): HTMLElement => {
    if (content) return content
    content = document.createElement("div")
    content.setAttribute("data-aigui-zoom", "")
    for (const child of Array.from(block.childNodes)) if (child !== bar) content.appendChild(child)
    block.insertBefore(content, bar)
    enablePan(block, content)
    return content
  }
  function setLevel(next: number) {
    level = Math.max(0, Math.min(STEPS.length - 1, next))
    const zoom = STEPS[level] ?? 1
    const box = wrap()
    // CSS zoom changes layout, so the block scrolls over the whole enlarged picture and an SVG
    // is drawn again at the new size rather than stretched.
    ;(box.style as CSSStyleDeclaration & { zoom: string }).zoom = zoom === 1 ? "" : String(zoom)
    block.toggleAttribute("data-aigui-zoomed", zoom !== 1)
    levelButton.textContent = `${Math.round(zoom * 100)}%`
    out.disabled = level === 0
    into.disabled = level === STEPS.length - 1
    window.dispatchEvent(new Event("resize"))
  }

  const full = button("⛶", "Full screen", () => {
    if (document.fullscreenElement === block) void document.exitFullscreen()
    else void block.requestFullscreen?.().catch(() => {})
  })

  const save = button("Save", "Save as PNG", async () => {
    const index = Array.from(root.children).indexOf(block) + 1
    save.disabled = true
    save.textContent = "…"
    try {
      let blob: Blob | undefined
      if (options.canSnapshot) {
        const page = decodeURIComponent(location.pathname.split("/").pop() ?? "")
        const res = await fetch(`/snapshot?page=${encodeURIComponent(page)}&block=${index}&theme=${options.theme}`).catch(() => undefined)
        if (res?.ok) blob = await res.blob()
      }
      blob ??= await pictureBlob(picture, block)
      if (blob) download(blob, fileName(index))
      else save.title = "This picture can only be saved from a page the agent's session serves"
    } finally {
      save.disabled = false
      save.textContent = "Save"
    }
  })
  if (!options.canSnapshot && picture.getBoundingClientRect().width * picture.getBoundingClientRect().height < 0.6 * block.getBoundingClientRect().width * block.getBoundingClientRect().height) {
    save.disabled = true
    save.title = "Open this page from the agent's session to save this picture"
  }

  bar.append(out, levelButton, into, full, save)
  block.appendChild(bar)
}

/** Drag to move around a zoomed picture; a click that does not move still reaches the picture. */
function enablePan(block: HTMLElement, content: HTMLElement) {
  let start: { x: number; y: number; left: number; top: number; moved: boolean } | undefined
  content.addEventListener("pointerdown", (event) => {
    if (!block.hasAttribute("data-aigui-zoomed") || event.button !== 0) return
    // A canvas turns or hovers under the pointer (3D, charts): leave it its drag.
    if ((event.target as Element).closest("canvas")) return
    start = { x: event.clientX, y: event.clientY, left: block.scrollLeft, top: block.scrollTop, moved: false }
  })
  window.addEventListener("pointermove", (event) => {
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 4) return
    start.moved = true
    block.setAttribute("data-aigui-panning", "")
    block.scrollLeft = start.left - dx
    block.scrollTop = start.top - dy
  })
  window.addEventListener("pointerup", () => {
    if (start?.moved) {
      // Swallow the click the drag would otherwise end in.
      window.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true })
    }
    start = undefined
    block.removeAttribute("data-aigui-panning")
  })
}

export function enableToolbar(root: HTMLElement, options: ToolbarOptions): void {
  const style = document.createElement("style")
  style.textContent = CSS
  document.head.appendChild(style)
  const offer = (target: EventTarget | null) => {
    const block = (target as Element | null)?.closest?.("#aigui-root > *") as HTMLElement | null
    if (!block || block.hasAttribute("data-aigui-has-tools") || block.hasAttribute("data-aigui-no-tools")) return
    const picture = pictureIn(block)
    if (picture) attach(root, block, picture, options)
    // Not a picture yet (still loading) — asked again next time the pointer comes back.
  }
  root.addEventListener("pointerover", (event) => offer(event.target))
  root.addEventListener("focusin", (event) => offer(event.target))
}
