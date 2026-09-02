import type { ActionDispatchOptions, ActionRequest, CardDef, JSONSchema, RenderMountContext } from "@ai-gui/core"

export type UIScalar = string | number | boolean | null
export interface UIStateBinding { $state: string }
export type UIScalarExpression = UIScalar | UIStateBinding
export type UIBoundJSON = UIScalarExpression | UIBoundJSON[] | { [key: string]: UIBoundJSON }

export type UIGap = "none" | "sm" | "md" | "lg"
export type UIAlign = "start" | "center" | "end" | "stretch"
export type UITextTone = "default" | "muted" | "positive" | "warning" | "critical"
export type UIFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "radio"

export interface UIAction { type: string; params?: UIBoundJSON }
export interface UIOption { label: string; value: string }
export interface UIKeyValueItem { label: string; value: UIScalarExpression }

export interface UIStackNode { kind: "stack"; id: string; direction?: "row" | "column"; gap?: UIGap; align?: UIAlign; children: UINode[] }
export interface UIGridNode { kind: "grid"; id: string; columns: 1 | 2 | 3 | 4; gap?: UIGap; children: UINode[] }
export interface UITextNode { kind: "text"; id: string; text: UIScalarExpression; tone?: UITextTone }
export interface UIHeadingNode { kind: "heading"; id: string; level: 2 | 3 | 4; text: UIScalarExpression }
export interface UIDividerNode { kind: "divider"; id: string }
export interface UIListNode { kind: "list"; id: string; ordered?: boolean; items: UIScalar[] }
export interface UITableNode { kind: "table"; id: string; caption: string; headers: string[]; rows: UIScalar[][] }
export interface UIKeyValueNode { kind: "keyValue"; id: string; items: UIKeyValueItem[] }
export interface UIFormNode { kind: "form"; id: string; children: UINode[]; submit: { type: string }; submitLabel?: string }
export interface UIFieldNode {
  kind: "field"; id: string; bind: string; fieldType: UIFieldType; label: string
  required?: boolean; placeholder?: string; minLength?: number; maxLength?: number
  pattern?: string; min?: number; max?: number; options?: UIOption[]
}
export interface UIButtonNode { kind: "button"; id: string; label: string; variant?: "primary" | "secondary" | "danger"; action: UIAction }
export interface UICardNode { kind: "card"; id: string; type: string; data: UIBoundJSON }

export type UINode = UIStackNode | UIGridNode | UITextNode | UIHeadingNode | UIDividerNode | UIListNode | UITableNode | UIKeyValueNode | UIFormNode | UIFieldNode | UIButtonNode | UICardNode

export interface UIDocument {
  version: 1
  id: string
  state?: Record<string, UIScalar>
  root: UINode
}

export interface UILimits {
  sourceBytes: number
  nodes: number
  depth: number
  children: number
  state: number
  string: number
  totalStrings: number
  tableRows: number
  tableColumns: number
  options: number
  boundJSONDepth: number
  boundJSONNodes: number
}

export type UILimitOverrides = Partial<UILimits>

export interface UIValidationOptions {
  registry: UICardRegistry
  actionRuntime: UIActionRuntime
  limits?: UILimitOverrides
}

export interface UIMountOptions {
  actionRuntime: UIActionRuntime
  mountContext?: RenderMountContext
  /**
   * The locale for the handful of strings this plugin draws itself — a field's
   * "required" line, an action's failure line. The plugin renderer takes it
   * from NodeRenderContext, so a host that already tells the renderer its
   * locale does not pass it again here.
   */
  locale?: string
  /**
   * The host's colour scheme, "light" or "dark". Only the tone colours depend
   * on it; everything else is derived from the inherited text colour. Absent,
   * the OS preference decides.
   */
  theme?: string
}

export interface UIPluginOptions extends UIValidationOptions {
  /**
   * Falls back to the locale the renderer reports per node. Set this only to
   * pin the plugin's own strings to one language regardless of the host.
   */
  locale?: string
  /** Falls back to the theme the renderer reports per node. */
  theme?: string
}

export interface UICardRegistry {
  get(type: string): Readonly<CardDef> | undefined
  list(): Readonly<CardDef>[]
  validate(type: string, data: unknown): boolean
}

export interface UIActionRuntime {
  hasAction(type: string): boolean
  listActionTypes(): readonly string[]
  /**
   * The parameter schema of one action, for the prompt spec to describe.
   * Optional so a host with its own runtime object keeps working; without it
   * the rules can only name the action, and a model has to guess what a form
   * submitting to it should bind — which it gets wrong.
   */
  describeAction?(type: string): JSONSchema | undefined
  dispatch<TResult = unknown>(request: ActionRequest, options?: ActionDispatchOptions): Promise<TResult>
}
