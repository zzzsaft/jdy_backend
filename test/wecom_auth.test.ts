import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-with-sufficient-entropy";

const {
  generateToken,
  verifyToken,
} = await import("../src/utils/jwt.js");

const newFrontendToken = generateToken({
  userId: "same-user",
  corpId: "ww8a8396c98dc4923d",
  clientId: "new-frontend",
  scopes: ["profile:read"],
  name: null,
  avatar: null,
});

const decoded = verifyToken(newFrontendToken, ["new-frontend"]);
assert.equal(decoded.sub, "same-user");
assert.equal(decoded.corpId, "ww8a8396c98dc4923d");
assert.equal(decoded.clientId, "new-frontend");
assert.deepEqual(decoded.scopes, ["profile:read"]);
assert.throws(() => verifyToken(newFrontendToken, ["legacy-frontend"]));

const legacyToken = jwt.sign(
  { userId: "legacy-user", name: "Legacy", avatar: null },
  process.env.JWT_SECRET
);
const legacyDecoded = verifyToken(legacyToken, ["legacy-frontend"]);
assert.equal(legacyDecoded.clientId, "legacy-frontend");

console.log("WeCom authentication tests passed");
