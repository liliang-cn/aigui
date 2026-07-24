# @ai-gui/plugin-citation

Dependency-free, framework-neutral source citations for AIGUI. The plugin claims a complete `sources` fenced JSON block, validates it strictly, and renders a safe element descriptor.

## Install

```sh
pnpm add @ai-gui/core @ai-gui/plugin-citation
```

## Usage

```ts
import { citation } from "@ai-gui/plugin-citation"

const plugins = [citation()]
```

The default URL policy permits HTTPS only:

````markdown
```sources
{
  "sources": [
    {
      "id": "spec-1",
      "title": "AIGUI specification",
      "url": "https://example.com/spec",
      "citedText": "Optional exact supporting text"
    }
  ]
}
```
````

Development HTTP origins can be allowlisted by host. A hostname permits any port; `host:port` permits only that exact port.

```ts
citation({ allowedHttpHosts: ["localhost", "dev.example.test:4317"] })
```

## Security

- Closed-fence and renderer-level completion gating.
- Strict JSON schema with unknown-key rejection.
- Maximum 64 KiB UTF-8 input, 100 sources, and bounded field lengths.
- Unique IDs restricted to letters, numbers, underscores, and hyphens, starting with a letter.
- HTTPS-only by default; HTTP requires an exact allowlist match.
- URL credentials, relative URLs, model HTML, and model actions are not supported.
- Invalid input renders one generic fallback without reflecting source data or validation details.
- Output is synchronous and framework-neutral.

## Exports

- `citation(options?)`
- `citationPromptSpec()`
- `parseSourcesDefinition(source, options?)`
- `serializeSourcesFence(definition, options?)`
- `citationCss`
- `CitationOptions`, `CitationSource`, `SourcesDefinition`, and `SourcesParseResult`
