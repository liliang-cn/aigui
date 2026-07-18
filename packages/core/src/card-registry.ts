import { parsePartialJSON } from "./partial-json"
import type { CardDef, JSONSchema } from "./types"

export interface CardParseResult {
  data: unknown
  complete: boolean
  valid: boolean
}

export class CardRegistry {
  private cards = new Map<string, CardDef>()

  register(def: CardDef): void {
    this.cards.set(def.type, def)
  }

  has(type: string): boolean {
    return this.cards.has(type)
  }

  getRender(type: string): unknown {
    return this.cards.get(type)?.render
  }

  parse(type: string, rawJson: string): CardParseResult {
    const def = this.cards.get(type)
    const { data, complete } = parsePartialJSON(rawJson)
    if (!def) return { data, complete, valid: false }
    const valid = complete && this.validate(def, data)
    return { data, complete, valid }
  }

  private validate(def: CardDef, data: unknown): boolean {
    if (def.validate) return def.validate(data as never)
    if (def.schema) return validateSchema(def.schema, data)
    return true
  }

  toPromptSpec(): string {
    const lines: string[] = [
      "You can output cards. Format: a ```card:<type> fenced block with JSON inside. Available cards:",
    ]
    for (const def of this.cards.values()) {
      lines.push(`- \`card:${def.type}\`: ${def.description}`)
      if (def.schema?.properties) {
        const fields = Object.entries(def.schema.properties)
          .map(([k, v]) => `${k}(${v.type ?? "any"})`)
          .join(", ")
        lines.push(`  fields: ${fields}`)
      }
      if (def.example !== undefined) lines.push(`  example: ${JSON.stringify(def.example)}`)
    }
    return lines.join("\n")
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {}
    for (const def of this.cards.values()) {
      if (def.schema) properties[def.type] = def.schema
    }
    return { type: "object", properties }
  }
}

/** Minimal JSON Schema validation: covers type / required / properties, enough for cards. */
function validateSchema(schema: JSONSchema, data: unknown): boolean {
  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false
    const obj = data as Record<string, unknown>
    for (const req of schema.required ?? []) if (!(req in obj)) return false
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj && !validateSchema(sub, obj[key])) return false
    }
    return true
  }
  if (schema.type === "array") {
    if (!Array.isArray(data)) return false
    return schema.items ? data.every((d) => validateSchema(schema.items as JSONSchema, d)) : true
  }
  if (schema.type === "string") return typeof data === "string"
  if (schema.type === "number") return typeof data === "number"
  if (schema.type === "boolean") return typeof data === "boolean"
  return true
}
