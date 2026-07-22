import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType, type VNode } from "vue"
import { sanitizeHtml, type RenderOutput } from "@ai-gui/core"

/** Host element for imperative `mount` outputs, wired to Vue's lifecycle. */
const MountHost = defineComponent({
  name: "MountHost",
  props: {
    mount: { type: Function as PropType<(el: HTMLElement) => void | (() => void)>, required: true },
  },
  setup(props) {
    const elRef = ref<HTMLElement | null>(null)
    let cleanup: void | (() => void)
    onMounted(() => {
      if (elRef.value) cleanup = (props.mount as (el: HTMLElement) => void | (() => void))(elRef.value)
    })
    onBeforeUnmount(() => {
      if (typeof cleanup === "function") cleanup()
    })
    return () => h("div", { ref: elRef, "data-aigui-mount": "" })
  },
})

/** Translate a framework-neutral RenderOutput into a Vue VNode. */
export function renderOutput(out: RenderOutput): VNode {
  switch (out.kind) {
    case "html":
      return h("div", { innerHTML: sanitizeHtml(out.html) })
    case "element":
      return h(out.tag, out.props, (out.children ?? []).map(renderOutput))
    case "mount":
      return h(MountHost, { mount: out.mount })
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
  },
  setup(props) {
    const resolved = ref<RenderOutput | null>(null)
    props.promise.then((v) => {
      resolved.value = v
    })
    return () => (resolved.value ? renderOutput(resolved.value) : h("span", { "data-aigui-async-pending": "" }))
  },
})
