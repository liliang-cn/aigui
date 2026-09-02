import type { MessageBundle } from "@ai-gui/core"

/**
 * The strings this plugin draws itself.
 *
 * Everything else in a `ui` block is the model's own text, already in the
 * product's language. These few lines are the plugin's, and until they were
 * translated a Chinese answer ended with an English "Action failed." under the
 * button — the exact case NodeRenderContext.locale exists for.
 *
 * The action keys are split by what the reader can do about the failure, not by
 * which class was thrown: retry, fix the input, or nothing. `action.failed` is
 * the catch-all, and deliberately says nothing about the cause — see
 * safeActionError in mount.ts for why an error from host code never reaches the
 * screen.
 */
export const UI_MESSAGES: MessageBundle = {
  en: {
    "invalid": "This interface could not be displayed.",
    "invalid.reason": "This interface could not be displayed: {reason}",
    "invalid.duplicate": "Only the first interface in a reply is shown.",
    "field.required": "This field is required.",
    "field.min": "Must be at least {min}.",
    "field.max": "Must be at most {max}.",
    "field.minLength": "Must contain at least {min} characters.",
    "field.maxLength": "Must contain at most {max} characters.",
    "field.pattern": "Must match the required format.",
    "field.option": "Select an allowed option.",
    "action.failed": "Action failed.",
    "action.notFound": "That action is not available.",
    "action.invalid": "Check the values and try again.",
    "action.timeout": "The action took too long. Try again.",
    "action.cancelled": "Action cancelled.",
    "action.unavailable": "This interface is no longer active.",
  },
  "zh-CN": {
    "invalid": "这个界面无法显示。",
    "invalid.reason": "这个界面无法显示：{reason}",
    "invalid.duplicate": "一条回复里只显示第一个界面。",
    "field.required": "此项必填。",
    "field.min": "不能小于 {min}。",
    "field.max": "不能大于 {max}。",
    "field.minLength": "至少需要 {min} 个字符。",
    "field.maxLength": "最多 {max} 个字符。",
    "field.pattern": "格式不正确。",
    "field.option": "请选择一个允许的选项。",
    "action.failed": "操作失败。",
    "action.notFound": "该操作不可用。",
    "action.invalid": "请检查填写的内容后重试。",
    "action.timeout": "操作超时，请重试。",
    "action.cancelled": "操作已取消。",
    "action.unavailable": "这个界面已经失效。",
  },
}

/** Fill `{reason}` and friends, leaving an absent value as the empty string. */
export function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "")
}
