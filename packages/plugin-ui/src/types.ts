import type { ActionDispatchOptions, ActionRequest, CardDef, RenderMountContext } from "@ai-gui/core"

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
}

export interface UIPluginOptions extends UIValidationOptions {}

export interface UICardRegistry {
  get(type: string): Readonly<CardDef> | undefined
  list(): Readonly<CardDef>[]
  validate(type: string, data: unknown): boolean
}

export interface UIActionRuntime {
  hasAction(type: string): boolean
  listActionTypes(): readonly string[]
  dispatch<TResult = unknown>(request: ActionRequest, options?: ActionDispatchOptions): Promise<TResult>
}
