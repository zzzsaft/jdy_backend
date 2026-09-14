import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/services/crm/centralAuth.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
let identity = { iss: "https://fixture.example", aud: "jdy-crm", clientId: "crm", corpId: "fixture-corp", wecomUserId: "fixture-user", scopes: ["module:access"] };
vm.runInNewContext(code, {
  exports, process: { env: { CRM_SSO_ENABLED: "true", CRM_SSO_ISSUER: "https://fixture.example", CRM_SSO_MODULE_SECRET: "fixture", CRM_SSO_CORP_ID: "fixture-corp" } },
  require: () => ({ getWechatAuthClient: () => ({ corpId: "fixture-corp", scopes: ["legacy-scope"] }) }),
  Buffer, AbortSignal,
  fetch: async (url, options) => {
    assert.equal(options.redirect, "error");
    return { ok: true, json: async () => url.endsWith("/userinfo") ? identity : { access_token: "fixture-token" } };
  },
});
assert.equal((await exports.verifyCRMToken("fixture-token")).userId, "fixture-user");
for (const field of ["aud", "clientId", "corpId", "iss"]) {
  const saved = identity[field]; identity[field] = "wrong";
  await assert.rejects(() => exports.verifyCRMToken("fixture-token")); identity[field] = saved;
}
identity.scopes = [];
await assert.rejects(() => exports.verifyCRMToken("fixture-token"));
console.log("CRM central identity audience, corporation, issuer and scope checks passed");
