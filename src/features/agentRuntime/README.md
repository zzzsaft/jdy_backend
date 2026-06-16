# Agent Runtime

`agentRuntime` is the shared AI runtime for business agents. It owns the
conversation and execution records that should be reused by product config,
sales, quote, JDY upload, and future agents.

The runtime keeps generic AI state out of business artifact tables:

- `agent_sessions`: one continuous user conversation.
- `agent_messages`: user, assistant, system, and tool-facing messages.
- `agent_runs`: one agent execution under a session.
- `agent_tool_calls`: planner/executor tool step traces.

Business outputs stay in feature-owned artifact tables. For example,
`productConfigAgent` writes product configuration artifacts to
`agent_generated_configs`; future agents should add their own artifact or job
tables instead of storing unrelated payloads in the config table.

## Public Entry Points

- `GET /agentRuntime/sessions`
- `POST /agentRuntime/sessions`
- `POST /agentRuntime/run`
- `GET /agentRuntime/sessions/:sessionId`
- `PATCH /agentRuntime/sessions/:sessionId`
- `GET /agentRuntime/runs/:runId`

`POST /agentRuntime/sessions` creates a generic conversation by default. When
`agentType` is omitted, the session is stored as `generalAgent`; feature-specific
wrappers such as `productConfigAgent` may still pass their own agent type.

`POST /agentRuntime/run` accepts an optional `agentType`. If it is omitted, the
runtime uses `routeAgentRuntimeMessage` to classify the message for that run:

- Product configuration language routes to `productConfigAgent`.
- Sales language routes to `salesAgent`.
- Quote language routes to `quoteAgent`.
- Upload/JDY language routes to `jdyUploadAgent`.
- Unclear requests stay under `generalAgent` and return a clarification response
  without creating a run.

Only `productConfigAgent` is registered today. Reserved agents such as
`salesAgent` and `quoteAgent` intentionally return a "not enabled yet" assistant
message while preserving the session and user message.

This makes the session a common conversation container, while each `agent_run`
records the concrete agent that handled one turn.

## Handler Contract

Agent handlers are registered in `defaultRuntime.ts`:

```ts
export const agentRuntimeService = new AgentRuntimeService(PgDataSource)
  .registerAgent(createProductConfigAgentRuntimeHandler());
```

A handler provides:

- `agentType`: stable agent key.
- `createPlan(input)`: parse intent and return planner/context metadata.
- `executePlan(input)`: execute tool steps and return assistant output.
- `listArtifactsForSession(input)`: optional artifact summaries for session
  detail responses.

The runtime persists the common lifecycle:

1. Create or reuse the session.
2. Save the user message.
3. Create an `agent_run` from the handler plan.
4. Save every tool call trace, including failures.
5. Save the assistant message.
6. Return session, run, messages, artifacts, and context.

If execution fails, the failed run, completed tool calls, and error message are
kept for auditability.

## Migrations

The generic runtime tables are defined in:

- `src/features/agentRuntime/scripts/migration_add_agent_runtime_tables.sql`

Feature-owned artifact tables live with their owning feature, such as:

- `src/features/productConfigAgent/scripts/migration_add_agent_generated_configs.sql`
