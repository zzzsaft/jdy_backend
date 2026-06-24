import assert from "node:assert/strict";
import {
  decryptJson,
  encryptJson,
  isWechatProxyEncryptedBody,
} from "../src/api/jctimes/wechat_proxy_crypto.js";

const secret = "test-wechat-proxy-secret";
const payload = {
  method: "POST",
  path: "/cgi-bin/externalcontact/batch/get_by_user",
  tokenType: "crm",
  query: {},
  payload: { userid_list: ["LiangZhi"], limit: 100 },
};

const encrypted = encryptJson(payload, secret);
assert.match(encrypted.iv, /^[A-Za-z0-9+/]+={0,2}$/);
assert.match(encrypted.tag, /^[A-Za-z0-9+/]+={0,2}$/);
assert.match(encrypted.data, /^[A-Za-z0-9+/]+={0,2}$/);
assert.equal(Buffer.from(encrypted.iv, "base64").length, 12);
assert.equal(Buffer.from(encrypted.tag, "base64").length, 16);
assert.deepEqual(decryptJson(encrypted, secret), payload);
assert.equal(isWechatProxyEncryptedBody({ encrypted }), true);
assert.equal(isWechatProxyEncryptedBody({ encrypted: { ...encrypted, tag: 1 } }), false);

assert.throws(() =>
  decryptJson({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }, secret)
);

console.log("WeChat proxy crypto tests passed");
