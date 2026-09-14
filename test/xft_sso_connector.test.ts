import assert from "node:assert/strict";
import test from "node:test";
import { xftSSOApiClient } from "../src/features/xft/api/xft_sso.js";

test("XFT SSO adapter sends verified identity, validates redirect and never retries", async () => {
 const original=fetch, oldToken=process.env.CONNECTOR_JDY_BACKEND_TOKEN, oldBase=process.env.CONNECTOR_BASE_URL;
 process.env.CONNECTOR_BASE_URL="http://connector.test:4180";
 process.env.CONNECTOR_JDY_BACKEND_TOKEN="synthetic-token";
 let calls=0;
 let reply: Response;
 globalThis.fetch=(async (url,init)=>{
  calls++;
  assert.equal(String(url),"http://connector.test:4180/v1/providers/xft/sso-link");
  assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer synthetic-token");
  assert.equal(init?.redirect,"error");
  assert.deepEqual(JSON.parse(String(init?.body)),{userId:"test-user",todoId:"123"});
  return reply;
 }) as typeof fetch;
 try {
  reply=Response.json({url:"https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/1_2?secret=abc%2B%2F%3D&extTyp=todo"});
  const url=await xftSSOApiClient.getSSOLink("test-user",{todoId:"123"});
  assert.equal(new URL(url).searchParams.get("secret"),"abc+/=");
  for(const target of ["https://evil.test/?secret=x","javascript:alert(1)","https://xft.cmbchina.com/other?secret=x","https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/1_2"]){
   reply=Response.json({url:target});await assert.rejects(()=>xftSSOApiClient.getSSOLink("test-user",{todoId:"123"}),/Invalid XFT SSO/);
  }
  reply=new Response("sensitive response",{status:503});
  const before=calls;
  await assert.rejects(()=>xftSSOApiClient.getSSOLink("test-user",{todoId:"123"}),/HTTP 503/);
  assert.equal(calls,before+1);
 } finally {
  globalThis.fetch=original;
  if(oldToken===undefined)delete process.env.CONNECTOR_JDY_BACKEND_TOKEN;else process.env.CONNECTOR_JDY_BACKEND_TOKEN=oldToken;
  if(oldBase===undefined)delete process.env.CONNECTOR_BASE_URL;else process.env.CONNECTOR_BASE_URL=oldBase;
 }
});
