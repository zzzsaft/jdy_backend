# quoteRuntime

`quoteRuntime` is a compatibility route surface for the shared `agentRuntime`.

The quote and sales business agents are intentionally not implemented yet. Keep
their feature directories as placeholders until pricing, opportunity creation,
and Jiandaoyun upload behavior is explicitly designed.

Current behavior:

- `/quoteRuntime/*` routes mirror `/agentRuntime/*`.
- POST/PATCH quoteRuntime routes default missing `agentType` to `quoteAgent`.
- `quoteRuntimeService` provides the same defaulting behavior for code callers.
- Only registered runtime handlers execute business logic.
- `quoteAgent` and `salesAgent` requests are recorded as conversations and return
  a not-enabled response instead of pretending quote generation is available.
