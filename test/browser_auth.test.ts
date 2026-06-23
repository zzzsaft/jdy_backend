import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-with-sufficient-entropy";

const {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  browserCorsOptions,
  clearAuthCookie,
  createBrowserAuthMiddleware,
  serializeAuthCookie,
  setAuthCookie,
} = await import("../src/middleware/browserAuth.js");
const { extractToken, generateToken, verifyToken } = await import("../src/utils/jwt.js");

const allowedOrigin = "https://frontend.example.com";

function responseDouble() {
  const headers = new Map<string, unknown>();
  return {
    headers,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body?: unknown) {
      this.body = body;
      return this;
    },
  };
}

const payload = {
  userId: "user-1",
  corpId: "corp-1",
  clientId: "new-frontend",
  scopes: ["profile:read"],
  name: "User One",
  avatar: null,
};
const token = generateToken(payload);

const serialized = serializeAuthCookie(token);
assert.match(serialized, /^auth_token=/);
for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=1800"]) {
  assert.ok(serialized.includes(attribute));
}
assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 1800);

assert.equal(extractToken({ headers: { cookie: `auth_token=${token}` } } as any), token);
const bearerToken = generateToken({ ...payload, userId: "bearer-user" });
assert.equal(
  extractToken({ headers: { authorization: `Bearer ${bearerToken}`, cookie: `auth_token=${token}` } } as any),
  bearerToken,
);

const middleware = createBrowserAuthMiddleware(() => [allowedOrigin]);
function runMiddleware(request: any) {
  const response = responseDouble();
  let nextCalls = 0;
  middleware(request, response as any, () => { nextCalls += 1; });
  return { response, nextCalls };
}

let result = runMiddleware({ method: "POST", headers: { cookie: `auth_token=${token}`, origin: allowedOrigin } });
assert.equal(result.nextCalls, 1);

result = runMiddleware({ method: "DELETE", headers: { cookie: `auth_token=${token}`, referer: `${allowedOrigin}/settings` } });
assert.equal(result.nextCalls, 1);

result = runMiddleware({ method: "PATCH", headers: { cookie: `auth_token=${token}`, origin: "https://evil.example" } });
assert.equal(result.nextCalls, 0);
assert.equal(result.response.statusCode, 403);
assert.deepEqual(result.response.body, { error: "CSRF_REJECTED" });

result = runMiddleware({ method: "POST", headers: { cookie: `auth_token=${token}` } });
assert.equal(result.response.statusCode, 403);

result = runMiddleware({
  method: "POST",
  headers: { authorization: `Bearer ${bearerToken}`, cookie: `auth_token=${token}`, origin: "https://evil.example" },
});
assert.equal(result.nextCalls, 1);
assert.equal(result.response.headers.has("set-cookie"), false);

const nowSeconds = Math.floor(Date.now() / 1000);
const expiringToken = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: "5m",
  issuer: "jdy-backend",
  audience: payload.clientId,
});
result = runMiddleware({ method: "GET", headers: { cookie: `auth_token=${expiringToken}` } });
assert.equal(result.nextCalls, 1);
const rotatedCookie = String(result.response.headers.get("set-cookie"));
assert.match(rotatedCookie, /^auth_token=/);
const rotatedToken = decodeURIComponent(rotatedCookie.split(";", 1)[0].slice("auth_token=".length));
const rotated = verifyToken(rotatedToken);
assert.ok((rotated.exp ?? 0) - nowSeconds > 25 * 60);
assert.equal(rotated.userId, payload.userId);

const expiredToken = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: -1,
  issuer: "jdy-backend",
  audience: payload.clientId,
});
assert.throws(() => verifyToken(expiredToken));
assert.throws(() => verifyToken("not-a-jwt"));

result = runMiddleware({ method: "GET", headers: { cookie: `auth_token=${token}` } });
assert.equal(result.response.headers.has("set-cookie"), false);

const setResponse = responseDouble();
setAuthCookie(setResponse as any, token);
assert.equal(setResponse.headers.get("cache-control"), "no-store");
clearAuthCookie(setResponse as any);
assert.match(String(setResponse.headers.get("set-cookie")), /Max-Age=0/);

const corsOrigin = browserCorsOptions(() => [allowedOrigin]).origin as Function;
await new Promise<void>((resolve) => corsOrigin(allowedOrigin, (_error: unknown, value: boolean) => {
  assert.equal(value, true);
  resolve();
}));
await new Promise<void>((resolve) => corsOrigin("https://evil.example", (_error: unknown, value: boolean) => {
  assert.equal(value, false);
  resolve();
}));
assert.equal(browserCorsOptions().credentials, true);

const { authMe, logout } = await import("../src/routes/auth.js");
let routeResponse = responseDouble();
await authMe(
  { headers: { cookie: `auth_token=${token}` }, query: {} } as any,
  routeResponse as any,
);
assert.equal(routeResponse.statusCode, 200);
assert.deepEqual(routeResponse.body, payload);
assert.equal("token" in (routeResponse.body as object), false);
assert.equal(routeResponse.headers.get("cache-control"), "no-store");

routeResponse = responseDouble();
await authMe(
  { headers: { cookie: `auth_token=${expiredToken}` }, query: {} } as any,
  routeResponse as any,
);
assert.equal(routeResponse.statusCode, 401);

routeResponse = responseDouble();
await logout({} as any, routeResponse as any);
assert.equal(routeResponse.statusCode, 204);
assert.match(String(routeResponse.headers.get("set-cookie")), /^auth_token=.*Max-Age=0/);

console.log("Browser authentication tests passed");
