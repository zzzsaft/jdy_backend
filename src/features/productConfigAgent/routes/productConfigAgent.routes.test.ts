import assert from "node:assert/strict";
import {
  LegacyProductConfigAgentRoutes,
  normalizeBatchReviewOperations,
  ProductConfigAgentRoutes,
  requireProductConfigAgentAdmin,
  requireProductConfigAgentToken,
} from "./productConfigAgent.routes.js";
import { generateToken } from "../../../utils/jwt.js";

function routeSignature(path: string, method: string) {
  const route = LegacyProductConfigAgentRoutes.find(
    (item) => item.path === path && item.method === method,
  );
  assert.ok(route, `route not found: ${method.toUpperCase()} ${path}`);
  return route;
}

function assertRegisteredBefore(params: {
  firstPath: string;
  firstMethod: string;
  secondPath: string;
  secondMethod: string;
}) {
  const firstIndex = LegacyProductConfigAgentRoutes.findIndex(
    (item) =>
      item.path === params.firstPath && item.method === params.firstMethod,
  );
  const secondIndex = LegacyProductConfigAgentRoutes.findIndex(
    (item) =>
      item.path === params.secondPath && item.method === params.secondMethod,
  );
  assert.notEqual(firstIndex, -1, `route not found: ${params.firstPath}`);
  assert.notEqual(secondIndex, -1, `route not found: ${params.secondPath}`);
  assert.ok(
    firstIndex < secondIndex,
    `${params.firstPath} must be registered before ${params.secondPath}`,
  );
}

function assertRouteShape() {
  routeSignature("/quoteAgent/contracts/summary", "get");
  routeSignature("/quoteAgent/contracts", "get");
  routeSignature("/quoteAgent/contracts/:documentId/archive", "post");
  routeSignature("/quoteAgent/contracts/:documentId/archive-readiness", "get");
  routeSignature("/quoteAgent/contract-archives", "get");
  routeSignature("/quoteAgent/contract-archives/:archiveId", "get");
  routeSignature("/quoteAgent/contract-archives/:archiveId", "patch");
  routeSignature("/quoteAgent/contract-archives/:archiveId/versions", "get");
  routeSignature("/quoteAgent/contract-archives/:archiveId/versions/:version", "get");
  routeSignature(
    "/quoteAgent/contract-archives/:archiveId/items/:itemId/product-bindings",
    "put",
  );
  routeSignature("/quoteAgent/product-configs/search", "get");
  routeSignature("/quoteAgent/dictionary-dirty/refresh/start", "post");
  routeSignature("/quoteAgent/dictionary-dirty/refresh/status", "get");
  routeSignature("/quoteAgent/extractions/renormalize-batch", "post");
  routeSignature("/quoteAgent/candidates/clusters/review-prompt", "get");
  routeSignature("/quoteAgent/candidates/clusters", "get");
  routeSignature("/quoteAgent/candidates/clusters/suggestions/batch", "post");
  routeSignature("/quoteAgent/candidates/reviews/batch", "post");
  routeSignature("/quoteAgent/candidates/reviews/batch/jobs/:jobId", "get");
  routeSignature("/quoteAgent/candidates", "get");
  routeSignature("/quoteAgent/dictionary/term-types", "get");
  routeSignature("/quoteAgent/dictionary/term-types", "post");
  routeSignature("/quoteAgent/dictionary/term-types/:id", "patch");
  routeSignature("/quoteAgent/dictionary/term-types/:id", "delete");
  routeSignature("/quoteAgent/dictionary/values", "get");
  routeSignature("/quoteAgent/dictionary/values", "post");
  routeSignature("/quoteAgent/dictionary/values/:id", "patch");
  routeSignature("/quoteAgent/dictionary/values/:id", "delete");
  routeSignature("/quoteAgent/dictionary/unit-aliases", "get");
  routeSignature("/quoteAgent/dictionary/unit-aliases", "post");
  routeSignature("/quoteAgent/dictionary/unit-aliases/:id", "patch");
  routeSignature("/quoteAgent/dictionary/product-types", "get");
  routeSignature("/quoteAgent/candidates/units", "get");
  routeSignature("/quoteAgent/candidates/units/review-prompt", "get");
  routeSignature("/quoteAgent/candidates/units/:candidateId/approve", "post");
  routeSignature("/quoteAgent/candidates/units/:candidateId/reject", "post");

  assertRegisteredBefore({
    firstPath: "/quoteAgent/extractions/renormalize-batch",
    firstMethod: "post",
    secondPath: "/quoteAgent/extractions/:documentId/renormalize",
    secondMethod: "post",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/contracts/summary",
    firstMethod: "get",
    secondPath: "/quoteAgent/contracts/:documentId",
    secondMethod: "get",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/contracts/:documentId/archive",
    firstMethod: "post",
    secondPath: "/quoteAgent/contracts/:documentId",
    secondMethod: "get",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/contracts/:documentId/archive-readiness",
    firstMethod: "get",
    secondPath: "/quoteAgent/contracts/:documentId",
    secondMethod: "get",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/contract-archives/:archiveId/versions",
    firstMethod: "get",
    secondPath: "/quoteAgent/contract-archives/:archiveId",
    secondMethod: "get",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/candidates/clusters",
    firstMethod: "get",
    secondPath: "/quoteAgent/candidates/:type/:candidateId/reject",
    secondMethod: "post",
  });
  assertRegisteredBefore({
    firstPath: "/quoteAgent/candidates/clusters/suggestions/batch",
    firstMethod: "post",
    secondPath: "/quoteAgent/candidates/:type/:candidateId/reject",
    secondMethod: "post",
  });
}

function productConfigRouteSignature(path: string, method: string) {
  const route = ProductConfigAgentRoutes.find(
    (item) => item.path === path && item.method === method,
  );
  assert.ok(route, `route not found: ${method.toUpperCase()} ${path}`);
  return route;
}

async function assertProductionRouteRequiresToken(path: string, method: string) {
  const originalPort = process.env.PORT;
  try {
    process.env.PORT = "2000";
    const response = mockResponse();
    const route = productConfigRouteSignature(path, method);
    await route.action({ headers: {}, query: {}, params: {}, body: {} } as any, response as any);
    assert.equal(response.statusCode, 401, `${method.toUpperCase()} ${path} should require token`);
  } finally {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  }
}

function assertProductConfigAgentRouteAliases() {
  productConfigRouteSignature("/productConfigAgent/agent/sessions", "post");
  productConfigRouteSignature("/productConfigAgent/agent/run", "post");
  productConfigRouteSignature("/productConfigAgent/agent/sessions/:sessionId", "get");
  productConfigRouteSignature("/productConfigAgent/agent/configs/:id", "get");
  productConfigRouteSignature(
    "/productConfigAgent/agent/configs/:id/share-token",
    "post",
  );
  productConfigRouteSignature(
    "/productConfigAgent/agent/shared/:shareToken",
    "get",
  );
  productConfigRouteSignature("/productConfigAgent/contracts/upload", "post");
  productConfigRouteSignature("/productConfigAgent/contracts/summary", "get");
  productConfigRouteSignature("/productConfigAgent/product-configs/search", "get");
  productConfigRouteSignature("/productConfigAgent/dictionary-dirty/refresh/start", "post");
  productConfigRouteSignature("/productConfigAgent/dictionary-dirty/refresh/status", "get");
  productConfigRouteSignature("/productConfigAgent/dictionary/unit-aliases", "get");
  productConfigRouteSignature("/productConfigAgent/candidates/units", "get");
  productConfigRouteSignature("/productConfigAgent/candidates/units/review-prompt", "get");
  productConfigRouteSignature("/productConfigAgent/candidates/reviews/batch/jobs/:jobId", "get");
  productConfigRouteSignature("/productConfigAgent/dictionary/product-types", "get");

  assert.equal(
    ProductConfigAgentRoutes.some((route) => route.path.startsWith("/quoteAgent/")),
    false,
  );
  assert.equal(
    LegacyProductConfigAgentRoutes.some((route) =>
      route.path.startsWith("/quoteAgent/agent/"),
    ),
    false,
  );
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function testProductConfigAgentAdminGuard() {
  const originalPort = process.env.PORT;
  const originalProductConfigAdmins =
    process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS;
  const originalLegacyAdmins = process.env.QUOTE_AGENT_ADMIN_USER_IDS;

  try {
    process.env.PORT = "2001";
    delete process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS;
    delete process.env.QUOTE_AGENT_ADMIN_USER_IDS;
    let response = mockResponse();
    assert.equal(await requireProductConfigAgentAdmin({ headers: {} } as any, response as any), true);
    assert.equal(response.statusCode, 200);

    process.env.PORT = "2000";
    response = mockResponse();
    assert.equal(await requireProductConfigAgentAdmin({ headers: {} } as any, response as any), false);
    assert.equal(response.statusCode, 403);

    process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS = "admin";
    response = mockResponse();
    assert.equal(await requireProductConfigAgentAdmin({ headers: {} } as any, response as any), false);
    assert.equal(response.statusCode, 401);

    response = mockResponse();
    const userToken = generateToken({ userId: "user", name: "", avatar: "" });
    assert.equal(
      await requireProductConfigAgentAdmin(
        { headers: { authorization: `Bearer ${userToken}` } } as any,
        response as any,
      ),
      false,
    );
    assert.equal(response.statusCode, 403);

    response = mockResponse();
    const adminToken = generateToken({ userId: "admin", name: "", avatar: "" });
    assert.equal(
      await requireProductConfigAgentAdmin(
        { headers: { authorization: `Bearer ${adminToken}` } } as any,
        response as any,
      ),
      true,
    );
    assert.equal(response.statusCode, 200);

    delete process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS;
    process.env.QUOTE_AGENT_ADMIN_USER_IDS = "legacy-admin";
    response = mockResponse();
    const legacyAdminToken = generateToken({
      userId: "legacy-admin",
      name: "",
      avatar: "",
    });
    assert.equal(
      await requireProductConfigAgentAdmin(
        { headers: { authorization: `Bearer ${legacyAdminToken}` } } as any,
        response as any,
      ),
      true,
    );
    assert.equal(response.statusCode, 200);
  } finally {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalProductConfigAdmins === undefined) {
      delete process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS;
    } else {
      process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS =
        originalProductConfigAdmins;
    }
    if (originalLegacyAdmins === undefined) delete process.env.QUOTE_AGENT_ADMIN_USER_IDS;
    else process.env.QUOTE_AGENT_ADMIN_USER_IDS = originalLegacyAdmins;
  }
}

async function testProductConfigAgentTokenGuard() {
  const originalPort = process.env.PORT;

  try {
    process.env.PORT = "2001";
    let response = mockResponse();
    assert.equal(await requireProductConfigAgentToken({ headers: {} } as any, response as any), true);
    assert.equal(response.statusCode, 200);

    process.env.PORT = "2000";
    response = mockResponse();
    assert.equal(await requireProductConfigAgentToken({ headers: {} } as any, response as any), false);
    assert.equal(response.statusCode, 401);

    response = mockResponse();
    const userToken = generateToken({ userId: "user", name: "", avatar: "" });
    assert.equal(
      await requireProductConfigAgentToken(
        { headers: { authorization: `Bearer ${userToken}` } } as any,
        response as any,
      ),
      true,
    );
    assert.equal(response.statusCode, 200);
  } finally {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  }
}

function testBatchReviewOperationValidation() {
  assert.throws(
    () =>
      normalizeBatchReviewOperations([
        {
          candidateType: "term_type",
          candidateId: "1",
          action: "create_value",
        },
      ]),
    /unsupported term_type batch review action/,
  );

  assert.deepEqual(
    normalizeBatchReviewOperations([
      {
        candidateType: "term_type",
        candidateId: "1",
        action: "split_term_type",
        payload: {
          splits: [{ termType: "voltage", rawValue: "220V" }],
        },
      },
    ]),
    [
      {
        candidateType: "term_type",
        candidateId: "1",
        action: "split_term_type",
        payload: {
          splits: [{ termType: "voltage", rawValue: "220V" }],
        },
      },
    ],
  );

  assert.throws(
    () =>
      normalizeBatchReviewOperations([
        {
          candidateType: "term_type",
          candidateId: "1",
          action: "split_value",
        },
      ]),
    /unsupported term_type batch review action/,
  );

  assert.throws(
    () =>
      normalizeBatchReviewOperations(
        Array.from({ length: 201 }, (_, index) => ({
          candidateType: "value",
          candidateId: String(index + 1),
          action: "reject",
        })),
      ),
    /operations length must be <= 200/,
  );
}

async function testSensitiveReadRoutesRequireToken() {
  await assertProductionRouteRequiresToken("/productConfigAgent/contracts/:documentId", "get");
  await assertProductionRouteRequiresToken("/productConfigAgent/extractions", "get");
  await assertProductionRouteRequiresToken("/productConfigAgent/extractions/:documentId", "get");
  await assertProductionRouteRequiresToken("/productConfigAgent/candidates", "get");
  await assertProductionRouteRequiresToken("/productConfigAgent/dictionary/term-types", "get");
  await assertProductionRouteRequiresToken("/productConfigAgent/dictionary/values", "get");
}

assertRouteShape();
assertProductConfigAgentRouteAliases();
await testProductConfigAgentAdminGuard();
await testProductConfigAgentTokenGuard();
await testSensitiveReadRoutesRequireToken();
testBatchReviewOperationValidation();
console.log("productConfigAgent route tests passed");
