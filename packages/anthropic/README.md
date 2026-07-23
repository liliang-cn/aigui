# @ai-gui/anthropic

Convert Anthropic Messages streams into AIGUI's provider-neutral `ModelStreamEvent` protocol. No Anthropic SDK is required.

```ts
import { contentDeltas } from "@ai-gui/core"
import { anthropicStream } from "@ai-gui/anthropic"

const response = await fetch("/api/anthropic")
await renderer.feed(contentDeltas(anthropicStream(response)))
```

`anthropicStream(source, { signal, onMalformed })` accepts a fetch `Response`, `ReadableStream<Uint8Array>`, SSE byte `AsyncIterable`, or an SDK-shaped `AsyncIterable` of Messages events. It emits text, thinking, citations, combined usage, and errors. Tool use is ignored and never executed.
