import assert from "node:assert/strict";
import { ConceptResolverService } from "./conceptResolver.service.js";
import { ProductConfigAgentRoutes } from "../routes/productConfigAgent.routes.js";

async function testServiceRejectsApplyBeforeDatabaseAccess() {
  let accessedDatabase = false;
  const service = new ConceptResolverService({
    getRepository: () => {
      accessedDatabase = true;
      throw new Error("database should not be accessed");
    },
  } as any);

  await assert.rejects(
    service.runResolver({ apply: true }),
    /only supports dry-run/,
  );
  assert.equal(accessedDatabase, false);
}

async function testRouteRejectsApply() {
  const route = ProductConfigAgentRoutes.find(
    (item) =>
      item.path === "/productConfigAgent/concept-resolver/run" &&
      item.method === "post",
  );
  assert.ok(route);

  let statusCode = 200;
  let payload: any;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as any;
  await route.action({ body: { apply: "true" }, headers: {} } as any, response);

  assert.equal(statusCode, 400);
  assert.match(String(payload?.error), /only supports dry-run/);
}

await testServiceRejectsApplyBeforeDatabaseAccess();
await testRouteRejectsApply();
