# @ai-gui/vercel-ai

Convert Vercel AI SDK streams into AIGUI's provider-neutral `ModelStreamEvent` protocol. The `ai` package is not required.

```ts
import { contentDeltas } from "@ai-gui/core"
import { vercelAIStream } from "@ai-gui/vercel-ai"

const response = await fetch("/api/chat")
await renderer.feed(contentDeltas(vercelAIStream(response)))
```

`vercelAIStream(source, options)` accepts AI SDK `fullStream` object parts, a fetch `Response`, a byte stream using the data stream protocol, or SSE UI message parts. Set `protocol: "sse" | "data"` when a raw stream does not carry response headers. Tool calls and tool results are ignored and never executed.
