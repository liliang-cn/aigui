export class UIDocumentError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues[0] ?? "Invalid UI document.")
    this.name = "UIDocumentError"
    this.issues = [...issues]
  }
}

export class UILimitError extends UIDocumentError {
  constructor(message: string) {
    super([message])
    this.name = "UILimitError"
  }
}
