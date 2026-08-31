import assert from "node:assert/strict";
import test from "node:test";
import { ApiClient } from "../src/api/tianyacha/api_client.js";

test("Tianyancha client calls Connect and never sends the provider token", async () => {
  const previousBase = process.env.CONNECTOR_BASE_URL;
  const previousToken = process.env.CONNECTOR_JDY_BACKEND_TOKEN;
  process.env.CONNECTOR_BASE_URL = "http://connector.internal:4180";
  process.env.CONNECTOR_JDY_BACKEND_TOKEN = "module-token";
  try {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({ error_code: 0, result: { name: "测试企业" } });
    }) as typeof fetch;
    const client = new ApiClient(fetcher);
    const result = await client.doRequest({ method: "GET", path: "/ic/baseinfoV3/2.0", query: { keyword: "测试企业" } });

    assert.equal((result as any).error_code, 0);
    assert.equal(calls[0].url, "http://connector.internal:4180/v1/providers/tianyancha/company/base-info");
    assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer module-token");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { keyword: "测试企业" });
    assert.equal(String(calls[0].init?.body).includes("provider-token"), false);
  } finally {
    if (previousBase === undefined) delete process.env.CONNECTOR_BASE_URL;
    else process.env.CONNECTOR_BASE_URL = previousBase;
    if (previousToken === undefined) delete process.env.CONNECTOR_JDY_BACKEND_TOKEN;
    else process.env.CONNECTOR_JDY_BACKEND_TOKEN = previousToken;
  }
});

test("Tianyancha client rejects unknown provider paths", async () => {
  const client = new ApiClient(async () => Response.json({}) as any);
  await assert.rejects(() => client.doRequest({ method: "GET", path: "/unknown" }), /不支持/);
});
