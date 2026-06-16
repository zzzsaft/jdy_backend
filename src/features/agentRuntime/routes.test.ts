import assert from "node:assert/strict";
import { AgentRuntimeRoutes } from "./routes.js";
import { routeAgentRuntimeMessage } from "./router.js";

function routeSignature(path: string, method: string) {
  const route = AgentRuntimeRoutes.find(
    (item) => item.path === path && item.method === method,
  );
  assert.ok(route, `route not found: ${method.toUpperCase()} ${path}`);
  return route;
}

routeSignature("/agentRuntime/sessions", "post");
routeSignature("/agentRuntime/sessions", "get");
routeSignature("/agentRuntime/run", "post");
routeSignature("/agentRuntime/sessions/:sessionId", "get");
routeSignature("/agentRuntime/sessions/:sessionId", "patch");
routeSignature("/agentRuntime/runs/:runId", "get");

assert.equal(
  routeAgentRuntimeMessage("帮我生成一份过滤器产品配置表").agentType,
  "productConfigAgent",
);
assert.equal(
  routeAgentRuntimeMessage("create a product configuration for a filter").agentType,
  "productConfigAgent",
);
assert.equal(routeAgentRuntimeMessage("帮我创建商机").agentType, "salesAgent");
assert.equal(routeAgentRuntimeMessage("create a sales opportunity").agentType, "salesAgent");
assert.equal(routeAgentRuntimeMessage("帮我算报价和折扣").agentType, "quoteAgent");
assert.equal(routeAgentRuntimeMessage("calculate quote price and discount").agentType, "quoteAgent");
assert.equal(
  routeAgentRuntimeMessage("上传到简道云表单").agentType,
  "jdyUploadAgent",
);
assert.equal(routeAgentRuntimeMessage("upload to jdy form").agentType, "jdyUploadAgent");
assert.equal(routeAgentRuntimeMessage("帮我处理一下").needsClarification, true);
assert.equal(routeAgentRuntimeMessage("帮我处理一下").agentType, "generalAgent");

console.log("agentRuntime route tests passed");
