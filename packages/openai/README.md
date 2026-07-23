# @ai-gui/openai

Convert OpenAI Responses API or Chat Completions streams into AIGUI's provider-neutral `ModelStreamEvent` protocol. No OpenAI SDK is required.

```ts
import { contentDeltas } from "@ai-gui/core"
import { openAIStream } from "@ai-gui/openai"

const response = await fetch("/api/openai")
await renderer.feed(contentDeltas(openAIStream(response)))
```

`openAIStream(source, { signal, onMalformed })` accepts a fetch `Response`, `ReadableStream<Uint8Array>`, SSE byte `AsyncIterable`, or an SDK-shaped `AsyncIterable` of Responses/Chat Completions events. It emits content, reasoning, citations, usage, and errors. Tool calls are ignored and never executed.
