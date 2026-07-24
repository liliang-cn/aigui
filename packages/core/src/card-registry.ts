import { parsePartialJSON } from "./partial-json"
import { validateJSONSchema } from "./json-schema"
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

  get(type: string): Readonly<CardDef> | undefined {
    return this.cards.get(type)
  }

  list(): Readonly<CardDef>[] {
    return [...this.cards.values()]
  }

  parse(type: string, rawJson: string): CardParseResult {
    const def = this.cards.get(type)
    const { data, complete } = parsePartialJSON(rawJson)
    if (!def) return { data, complete, valid: false }
    const valid = complete && this.validateDefinition(def, data)
    return { data, complete, valid }
  }

  validate(type: string, data: unknown): boolean {
    const def = this.cards.get(type)
    return def ? this.validateDefinition(def, data) : false
  }

  private validateDefinition(def: CardDef, data: unknown): boolean {
    try {
      if (def.validate) return def.validate(data as never)
      if (def.schema) return validateJSONSchema(def.schema, data).valid
      return true
    } catch {
      return false
    }
  }

  toPromptSpec(): string {
    if (this.cards.size === 0) return ""
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

  get size(): number {
    return this.cards.size
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {}
    for (const def of this.cards.values()) {
      if (def.schema) properties[def.type] = def.schema
    }
    return { type: "object", properties }
  }
}
