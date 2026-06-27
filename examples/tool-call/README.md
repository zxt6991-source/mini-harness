# Tool Call Example

Tool-call behavior is covered in `tests/runtime.test.ts`.

The current MVP registers `EchoTool` through `DefaultToolRegistry` and verifies that the engine can loop from a model `toolCalls` response to a final assistant message.
