import assert from "node:assert/strict";
import test from "node:test";
import { ApiClient as XFT } from "../src/features/xft/api/api_client.js";
import { ApiClient as JDY } from "../src/features/jdy/api/api_client.js";
import { ApiClient as FBT } from "../src/features/fbt/api/api_client.js";
import { ApiClient as BestSign } from "../src/features/bestsign/api/api_client.js";
import { ApiClient as Amap } from "../src/api/gaode/api_client.js";
import file from "../src/features/jdy/api/file.js";
import { fbtUserApiClient } from "../src/features/fbt/api/user.js";
import { connectorJSON } from "../src/api/connector/client.js";

class TestJDY extends JDY { call(options: any) { return this.doRequest(options, {name:"connect-test",duration:1,limit:100}); } }
class TestFBT extends FBT { call(options: any) { return this.doRequest(options); } }
class TestBestSign extends BestSign { call(options: any) { return this.doRequest(options); } }

test("Connect adapters preserve OA request and response contracts", async t => {
  const original = fetch;
  const oldBase = process.env.CONNECTOR_BASE_URL, oldToken = process.env.CONNECTOR_JDY_BACKEND_TOKEN;
  process.env.CONNECTOR_BASE_URL = "http://connector.test:4180";
  process.env.CONNECTOR_JDY_BACKEND_TOKEN = "synthetic-module-token";
  let calls: Array<{url: string; init: RequestInit}> = [];
  let respond = (_url: string, _init: RequestInit) => Response.json({});
  globalThis.fetch = (async (url: any, init: RequestInit) => {
    calls.push({ url: String(url), init });
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer synthetic-module-token");
    assert.equal(init.redirect, "error");
    return respond(String(url), init);
  }) as typeof fetch;
  try {
    await t.test("XFT identities, query, profile and failure envelope", async () => {
      respond = () => Response.json({returnCode:"FAIL",body:{reason:"test"}});
      const options = {method:"POST" as const,path:"/hrm/hrm2/hrm/HRCUSFLD",query:{name:"中文"},payload:{a:1}};
      const result = await new XFT("app").doRequest(options,"u-test","p-test");
      assert.equal(result.returnCode,"FAIL");
      assert.deepEqual(JSON.parse(String(calls.at(-1)!.init.body)),{profile:"app",...options,userId:"u-test",platformUserId:"p-test"});
      assert.deepEqual(options.query,{name:"中文"});
      await new XFT("connect").doRequest({method:"POST",path:"/test"});
      assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).profile,"connect");
    });
    await t.test("Unused XFT FormData stub is not sent to Connect", async () => {
      const before=calls.length;
      await assert.rejects(()=>new XFT("app").doRequest({method:"POST",path:"/common/api/common/xft-file/resource/uploadFile",payload:{formData:new FormData()}}),/multipart/);
      assert.equal(calls.length,before);
    });
    await t.test("DeepSeek SDK uses Connect and module auth", async () => {
      const {getDeepSeekClient}=await import("../src/llm/deepseekClient.js");
      respond=()=>Response.json({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:"OK"},finish_reason:"stop"}]});
      const result=await getDeepSeekClient().chat.completions.create({model:"fixture",messages:[{role:"user",content:"test"}],max_tokens:16});
      assert.equal(result.choices[0].message.content,"OK");
      assert.equal(calls.at(-1)!.url,"http://connector.test:4180/v1/providers/deepseek/chat/completions");
    });
    await t.test("JDY version and original payload", async () => {
      respond = () => Response.json({data:[{id:"test"}]});
      assert.deepEqual(await new TestJDY("v5").call({method:"POST",path:"app/entry/data/list",payload:{limit:20}}),{data:[{id:"test"}]});
      assert.deepEqual(JSON.parse(String(calls.at(-1)!.init.body)),{path:"/api/v5/app/entry/data/list",body:{limit:20}});
    });
    await t.test("FBT pagination, date filters, detail and SSO", async () => {
      const client = new TestFBT();
      respond = () => Response.json({items:[{id:"test"}],totalPages:2,totalCount:3});
      const employees = await client.call({method:"POST",path:"/openapi/org/employee/v1/list",payload:{page_index:2,page_size:500}});
      assert.deepEqual(employees,{code:0,data:{employees:[{id:"test"}],total_pages:2,total_count:3}});
      await client.call({method:"POST",path:"/openapi/apply/custom_common/v1/list",payload:{type:24,page_index:2,page_size:100,order_state:-1,create_start_time:"2026-09-01",create_end_time:"2026-09-14"}});
      assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).createStartTime,"2026-09-01");
      respond = () => Response.json({id:"detail"});
      assert.deepEqual(await client.call({method:"POST",path:"/openapi/apply/custom_trip/v1/detail",payload:{apply_id:"test-id"}}),{code:0,data:{id:"detail"}});
      assert.equal(calls.at(-1)!.init.method,"GET");
      respond = () => Response.json({url:"https://webapp.fenbeitong.com/ceLogin?token=test&path=home"});
      assert.match(await fbtUserApiClient.getSSOLink("synthetic-user","home"),/ceLogin/);
      assert.equal(calls.at(-1)!.url.endsWith("/sso-link"),true);
    });
    await t.test("BestSign binary, large ID, query encoding and policy", async () => {
      const client = new TestBestSign();
      respond = () => new Response('{"id":1234567890123456789}',{headers:{"content-type":"application/json"}});
      assert.deepEqual(await client.call({method:"GET",path:"/api/templates/v2",query:{enterpriseName:"A&B"}}),{id:"1234567890123456789"});
      assert.equal(new URL(calls.at(-1)!.url).searchParams.get("enterpriseName"),"A&B");
      respond = () => new Response(new Uint8Array([1,2,3]),{headers:{"content-type":"application/pdf"}});
      assert.deepEqual(await client.call({method:"POST",path:"/api/contracts/download-file",payload:{id:"test"}}),{contentType:"application/pdf",content:"AQID"});
      respond = () => Response.json({code:0});
      await client.call({method:"POST",path:"/gateway/rivers/api/oss/getPolicy"});
      assert.equal(calls.at(-1)!.url.endsWith("/bestsign/oss-policy"),true);
    });
    await t.test("Amap keeps regeocode provider envelope", async () => {
      respond = () => Response.json({status:"1",regeocode:{formatted_address:"test"}});
      assert.equal((await new Amap().doRequest({method:"GET",path:"/geocode/regeo",query:{location:"120,30"}})).regeocode.formatted_address,"test");
    });
    await t.test("JDY batch sends binary with one transaction and encoded filename", async () => {
      calls=[];respond=()=>Response.json({key:"file-test"});
      const values=await file.uploadBuffers("app","entry",[{fileName:"中文.png",buffer:Buffer.from([1,2])},{fileName:"b.png",buffer:Buffer.from([3])}]);
      assert.equal(values.length,2);assert.equal(calls.length,2);
      assert.equal(new URL(calls[0].url).searchParams.get("transaction_id"),new URL(calls[1].url).searchParams.get("transaction_id"));
      assert.equal(Buffer.from(new Headers(calls[0].init.headers).get("X-File-Name")!,"base64url").toString(),"中文.png");
      assert.deepEqual(Array.from(calls[0].init.body as Uint8Array),[1,2]);
    });
    await t.test("No retry or upstream secret in failure, missing token fails closed", async () => {
      calls=[];respond=()=>new Response("sensitive provider body",{status:403});
      await assert.rejects(()=>connectorJSON("/v1/providers/xft/invoke",{}),/HTTP 403/);
      assert.equal(calls.length,1);
      delete process.env.CONNECTOR_JDY_BACKEND_TOKEN;
      await assert.rejects(()=>connectorJSON("/v1/providers/xft/invoke",{}),/not configured/);
      assert.equal(calls.length,1);
    });
  } finally {
    globalThis.fetch=original;
    if(oldBase===undefined) delete process.env.CONNECTOR_BASE_URL;else process.env.CONNECTOR_BASE_URL=oldBase;
    if(oldToken===undefined) delete process.env.CONNECTOR_JDY_BACKEND_TOKEN;else process.env.CONNECTOR_JDY_BACKEND_TOKEN=oldToken;
  }
});
