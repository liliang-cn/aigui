import { defineComponent, h, markRaw, onBeforeUnmount, onMounted, ref, render, toRaw, watch, type Component, type PropType, type VNode } from "vue"
import { sanitizeHtml, type CardRegistry, type MountedCardSlot, type RendererOptions, type RenderMountContext, type RenderOutput, type SanitizeHtmlOptions } from "@ai-gui/core"

type MountFunction = Extract<RenderOutput, { kind: "mount" }>["mount"]

/** Host element for imperative `mount` outputs, wired to Vue's lifecycle. */
const MountHost = defineComponent({
  name: "MountHost",
  props: {
    mount: { type: Function as PropType<MountFunction>, required: true },
    context: { type: Object as PropType<RenderMountContext>, required: true },
  },
  setup(props) {
    const elRef = ref<HTMLElement | null>(null)
    let cleanup: void | (() => void)
    onMounted(() => {
      if (elRef.value) cleanup = props.mount(elRef.value, props.context)
    })
    watch(() => props.mount, (mount) => {
      if (typeof cleanup === "function") cleanup()
      cleanup = elRef.value ? mount(elRef.value, props.context) : undefined
    })
    onBeforeUnmount(() => {
      if (typeof cleanup === "function") cleanup()
    })
    return () => h("div", { ref: elRef, "data-aigui-mount": "" })
  },
})

/** Translate a framework-neutral RenderOutput into a Vue VNode. */
export function renderOutput(out: RenderOutput, sanitize?: RendererOptions["sanitize"], context: RenderMountContext = {}): VNode {
  switch (out.kind) {
    case "html":
      return h("div", { innerHTML: sanitizeOutput(out.html, sanitize) })
    case "element":
      return h(out.tag, out.props, (out.children ?? []).map((child) => renderOutput(child, sanitize, context)))
    case "mount":
      return h(MountHost, { mount: out.mount, context })
    case "card":
      // Cards from plugins fall back to a JSON dump in v1.
      return h("pre", { "data-aigui-card-fallback": "" }, [h("code", JSON.stringify(out.data, null, 2))])
  }
}

/** Await an async RenderOutput, rendering a placeholder until it resolves. */
export const AsyncOutput = defineComponent({
  name: "AsyncOutput",
  props: {
    promise: { type: Object as PropType<Promise<RenderOutput>>, required: true },
    sanitize: { type: [Boolean, Object] as PropType<RendererOptions["sanitize"]>, default: undefined },
    context: { type: Object as PropType<RenderMountContext>, default: () => ({}) },
  },
  setup(props) {
    const resolved = ref<RenderOutput | null>(null)
    const failed = ref(false)
    let generation = 0
    let active = true
    const awaitPromise = (promise: Promise<RenderOutput>) => {
      const current = ++generation
      resolved.value = null
      failed.value = false
      promise.then(
        (value) => { if (active && current === generation) resolved.value = value },
        () => { if (active && current === generation) failed.value = true },
      )
    }
    watch(() => [toRaw(props.promise)] as const, ([promise]) => awaitPromise(promise), { immediate: true })
    onBeforeUnmount(() => { active = false; generation++ })
    return () => {
      if (failed.value) return h("span", { "data-aigui-async-error": "" })
      if (!resolved.value) return h("span", { "data-aigui-async-pending": "" })
      try { return renderOutput(resolved.value, props.sanitize, props.context) } catch { return h("span", { "data-aigui-async-error": "" }) }
    }
  },
})

export function createRenderMountContext(
  registry?: CardRegistry,
  onCardAction?: (action: { type: string; params?: unknown; cardType: string; cardId?: string }) => void,
): RenderMountContext {
  return {
    mountCard(host, request): MountedCardSlot | undefined {
      const component = registry?.getRender(request.type) as Component | undefined
      if (!component) return undefined
      const card = markRaw(toRaw(component))
      let data = request.data
      let destroyed = false
      const renderCard = () => render(h(card, {
        data,
        onAction: (action: { type: string; params?: unknown }) => onCardAction?.({ ...action, cardType: request.type }),
      }), host)
      renderCard()
      return {
        update(nextData) {
          if (destroyed) return
          data = nextData
          renderCard()
        },
        destroy() {
          if (destroyed) return
          destroyed = true
          render(null, host)
        },
      }
    },
  }
}

function sanitizeOutput(html: string, sanitize: RendererOptions["sanitize"]): string {
  if (sanitize === false) return html
  return sanitizeHtml(html, typeof sanitize === "object" ? sanitize as SanitizeHtmlOptions : undefined)
}
