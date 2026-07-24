export class MapDocumentError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues[0] ?? "Invalid map document.")
    this.name = "MapDocumentError"
    this.issues = [...issues]
  }
}

export class MapLimitError extends MapDocumentError {
  constructor(message: string) {
    super([message])
    this.name = "MapLimitError"
  }
}
