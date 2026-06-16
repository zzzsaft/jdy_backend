import assert from "node:assert/strict";
import { QuoteRuntimeService, QUOTE_RUNTIME_DEFAULT_AGENT_TYPE } from "./service.js";

const calls: Array<{ method: string; payload: any }> = [];
const fakeRuntime = {
  createSession(payload: any) {
    calls.push({ method: "createSession", payload });
    return payload;
  },
  run(payload: any) {
    calls.push({ method: "run", payload });
    return payload;
  },
  listSessions(payload: any) {
    calls.push({ method: "listSessions", payload });
    return payload;
  },
  updateSession(payload: any) {
    calls.push({ method: "updateSession", payload });
    return payload;
  },
  getSessionDetail(payload: any) {
    calls.push({ method: "getSessionDetail", payload });
    return payload;
  },
  getRunDetail(payload: any) {
    calls.push({ method: "getRunDetail", payload });
    return payload;
  },
};

const service = new QuoteRuntimeService(fakeRuntime as any);
service.createSession({ ownerUserId: "u1" });
service.run({ message: "quote me" });
service.listSessions({ ownerUserId: "u1" });
service.updateSession({ sessionId: "1", title: "q" });
service.run({ agentType: "productConfigAgent", message: "explicit" });

assert.equal(QUOTE_RUNTIME_DEFAULT_AGENT_TYPE, "quoteAgent");
assert.equal(calls[0].payload.agentType, "quoteAgent");
assert.equal(calls[1].payload.agentType, "quoteAgent");
assert.equal(calls[2].payload.agentType, "quoteAgent");
assert.equal(calls[3].payload.agentType, "quoteAgent");
assert.equal(calls[4].payload.agentType, "productConfigAgent");

console.log("quoteRuntime service tests passed");
