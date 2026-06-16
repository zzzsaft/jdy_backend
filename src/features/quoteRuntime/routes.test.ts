import assert from "node:assert/strict";
import {
  QuoteRuntimeRoutes,
  withQuoteRuntimeDefaultAgentType,
} from "./routes.js";

function routeSignature(path: string, method: string) {
  const route = QuoteRuntimeRoutes.find(
    (item) => item.path === path && item.method === method,
  );
  assert.ok(route, `route not found: ${method.toUpperCase()} ${path}`);
  return route;
}

routeSignature("/quoteRuntime/sessions", "post");
routeSignature("/quoteRuntime/sessions", "get");
routeSignature("/quoteRuntime/run", "post");
routeSignature("/quoteRuntime/sessions/:sessionId", "get");
routeSignature("/quoteRuntime/sessions/:sessionId", "patch");
routeSignature("/quoteRuntime/runs/:runId", "get");

assert.equal(
  QuoteRuntimeRoutes.some((route) => route.path.startsWith("/agentRuntime")),
  false,
);

let observedAgentType: unknown;
const wrapped = withQuoteRuntimeDefaultAgentType(async (request, response) => {
  observedAgentType = request.body?.agentType;
  response.json({ ok: true });
});
await wrapped(
  {
    body: { message: "ambiguous" },
  } as any,
  {
    json() {
      return this;
    },
  } as any,
);
assert.equal(observedAgentType, "quoteAgent");

observedAgentType = undefined;
await wrapped(
  {
    body: { agentType: "productConfigAgent", message: "explicit" },
  } as any,
  {
    json() {
      return this;
    },
  } as any,
);
assert.equal(observedAgentType, "productConfigAgent");

console.log("quoteRuntime route tests passed");
