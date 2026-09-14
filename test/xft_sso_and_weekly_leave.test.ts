import assert from "node:assert/strict";
import { MessageService } from "../src/features/wechat/service/messageService.js";
import { sendLeave } from "../src/schedule/sendLeave.js";

// No OA RSA key is needed after SSO migration.
const { xftSSOApiClient } = await import("../src/features/xft/api/xft_sso.js");
const { xftSSOLogin } = await import(
  "../src/features/xft/controller/login.xft.controller.js"
);
const { wechatUserApiClient } = await import(
  "../src/features/wechat/api/user.js"
);

type FakeResponse = {
  statusCode: number;
  headers: Record<string,string>;
  setHeader(name: string, value: string): void;
  body?: string;
  redirectUrl?: string;
  status(code: number): FakeResponse;
  send(body: string): FakeResponse;
  redirect(url: string): FakeResponse;
};

const response = (): FakeResponse => ({
  statusCode: 200,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  redirect(url) {
    this.statusCode = 302;
    this.redirectUrl = url;
    return this;
  },
});

const originalGetUserInfo = wechatUserApiClient.getUserInfo;
const originalGetSSOLink = xftSSOApiClient.getSSOLink;
let issued: Array<{userId: string; options: any}> = [];
xftSSOApiClient.getSSOLink = async (userId, options) => {
  issued.push({userId, options});
  return "https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/1_2?pageId=xftoahome&secret=synthetic";
};
try {
  const missingCode = response();
  await xftSSOLogin({ query: {} } as any, missingCode as any);
  assert.equal(missingCode.statusCode, 400);
  assert.equal(missingCode.body, "Missing WeCom OAuth code");

  (wechatUserApiClient as any).getUserInfo = async () => ({
    errcode: 40029,
  });
  const missingUser = response();
  await xftSSOLogin(
    { query: { code: "invalid-test-code" } } as any,
    missingUser as any
  );
  assert.equal(missingUser.statusCode, 401);
  assert.equal(issued.length, 0);

  (wechatUserApiClient as any).getUserInfo = async () => ({
    userid: "TestUser",
  });
  const success = response();
  await xftSSOLogin(
    { query: { code: "valid-test-code", pageId: "xftoahome" } } as any,
    success as any
  );
  assert.equal(success.statusCode, 302);
  assert.match(
    success.redirectUrl ?? "",
    /^https:\/\/xft\.cmbchina\.com\/xft-gateway\/xft-login-new\/xwapi\/login\//
  );
  assert.match(success.redirectUrl ?? "", /pageId=xftoahome/);

  assert.deepEqual(issued[0], {userId: "TestUser", options: {todoId: undefined, pageId: "xftoahome"}});
  assert.equal(success.headers["Cache-Control"], "no-store");
  const invalidQuery = response();
  await xftSSOLogin({query:{code:"test",todoid:["one","two"]}} as any, invalidQuery as any);
  assert.equal(invalidQuery.statusCode,400);
  assert.equal(issued.length,1);
  (wechatUserApiClient as any).getUserInfo = async () => ({userid:"1234567890123456789012345"});
  await xftSSOLogin({query:{code:"test",todoid:"task-1"}} as any,response() as any);
  assert.equal(issued[1].userId,"12345678901234567890");
  assert.equal(issued[1].options.todoId,"task-1");
  xftSSOApiClient.getSSOLink = async () => {throw new Error("synthetic provider secret must not be logged");};
  const connectFailure=response();
  await xftSSOLogin({query:{code:"test"}} as any,connectFailure as any);
  assert.equal(connectFailure.statusCode,502);
  assert.equal(connectFailure.body,"XFT SSO service unavailable");

  (wechatUserApiClient as any).getUserInfo = async () => {
    throw new Error("upstream unavailable");
  };
  const failedLookup = response();
  await xftSSOLogin(
    { query: { code: "failed-test-code" } } as any,
    failedLookup as any
  );
  assert.equal(failedLookup.statusCode, 502);
} finally {
  (wechatUserApiClient as any).getUserInfo = originalGetUserInfo;
  xftSSOApiClient.getSSOLink = originalGetSSOLink;
}

const originalSendVoteInteraction = MessageService.prototype.sendVoteInteraction;
let releaseSend!: () => void;
let sendCompleted = false;
try {
  MessageService.prototype.sendVoteInteraction = async () => {
    await new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    sendCompleted = true;
  };
  const pending = sendLeave(
    {
      userid: "TestUser",
      stfSeq: "test-staff",
      stfName: "Test User",
      orgSeq: "test-org",
    },
    1
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sendCompleted, false);
  releaseSend();
  await pending;
  assert.equal(sendCompleted, true);
} finally {
  MessageService.prototype.sendVoteInteraction = originalSendVoteInteraction;
}

console.log("XFT SSO and weekly leave tests passed");
