import assert from "node:assert/strict";
import {
  normalizeBatchReviewOperations,
  QuoteAgentRoutes,
  requireQuoteAgentAdmin,
} from "./quoteAgent.routes.js";
import { generateToken } from "../../../utils/jwt.js";

function routeSignature(path: string, method: string) {
  const route = QuoteAgentRoutes.find(
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
  const firstIndex = QuoteAgentRoutes.findIndex(
    (item) =>
      item.path === params.firstPath && item.method === params.firstMethod,
  );
  const secondIndex = QuoteAgentRoutes.findIndex(
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
  routeSignature("/quoteAgent/extractions/renormalize-batch", "post");
  routeSignature("/quoteAgent/candidates/clusters/review-prompt", "get");
  routeSignature("/quoteAgent/candidates/clusters", "get");
  routeSignature("/quoteAgent/candidates/clusters/suggestions/batch", "post");
  routeSignature("/quoteAgent/candidates/reviews/batch", "post");
  routeSignature("/quoteAgent/candidates", "get");
  routeSignature("/quoteAgent/dictionary/term-types", "get");
  routeSignature("/quoteAgent/dictionary/term-types", "post");
  routeSignature("/quoteAgent/dictionary/term-types/:id", "patch");
  routeSignature("/quoteAgent/dictionary/term-types/:id", "delete");
  routeSignature("/quoteAgent/dictionary/values", "get");
  routeSignature("/quoteAgent/dictionary/values", "post");
  routeSignature("/quoteAgent/dictionary/values/:id", "patch");
  routeSignature("/quoteAgent/dictionary/values/:id", "delete");
  routeSignature("/quoteAgent/dictionary/product-types", "get");

  assertRegisteredBefore({
    firstPath: "/quoteAgent/extractions/renormalize-batch",
    firstMethod: "post",
    secondPath: "/quoteAgent/extractions/:documentId/renormalize",
    secondMethod: "post",
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

async function testQuoteAgentAdminGuard() {
  const originalPort = process.env.PORT;
  const originalAdmins = process.env.QUOTE_AGENT_ADMIN_USER_IDS;

  try {
    process.env.PORT = "2001";
    delete process.env.QUOTE_AGENT_ADMIN_USER_IDS;
    let response = mockResponse();
    assert.equal(await requireQuoteAgentAdmin({ headers: {} } as any, response as any), true);
    assert.equal(response.statusCode, 200);

    process.env.PORT = "2000";
    response = mockResponse();
    assert.equal(await requireQuoteAgentAdmin({ headers: {} } as any, response as any), false);
    assert.equal(response.statusCode, 403);

    process.env.QUOTE_AGENT_ADMIN_USER_IDS = "admin";
    response = mockResponse();
    assert.equal(await requireQuoteAgentAdmin({ headers: {} } as any, response as any), false);
    assert.equal(response.statusCode, 401);

    response = mockResponse();
    const userToken = generateToken({ userId: "user", name: "", avatar: "" });
    assert.equal(
      await requireQuoteAgentAdmin(
        { headers: { authorization: `Bearer ${userToken}` } } as any,
        response as any,
      ),
      false,
    );
    assert.equal(response.statusCode, 403);

    response = mockResponse();
    const adminToken = generateToken({ userId: "admin", name: "", avatar: "" });
    assert.equal(
      await requireQuoteAgentAdmin(
        { headers: { authorization: `Bearer ${adminToken}` } } as any,
        response as any,
      ),
      true,
    );
    assert.equal(response.statusCode, 200);
  } finally {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalAdmins === undefined) delete process.env.QUOTE_AGENT_ADMIN_USER_IDS;
    else process.env.QUOTE_AGENT_ADMIN_USER_IDS = originalAdmins;
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

assertRouteShape();
await testQuoteAgentAdminGuard();
testBatchReviewOperationValidation();
console.log("quoteAgent route tests passed");
