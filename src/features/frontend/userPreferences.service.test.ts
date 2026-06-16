import assert from "node:assert/strict";
import { UserPreferencesService } from "./userPreferences.service.js";
import { createUserPreferenceRoutes } from "./routes/userPreferences.routes.js";

type StoredPreference = {
  ownerUserId: string;
  preferenceKey: string;
  valueJsonb: unknown;
};

function createMemoryRepository() {
  const rows = new Map<string, StoredPreference>();
  const keyOf = (ownerUserId: string, preferenceKey: string) =>
    `${ownerUserId}\u0000${preferenceKey}`;

  return {
    rows,
    async findOne(options: any) {
      const where = options.where;
      return rows.get(keyOf(where.ownerUserId, where.preferenceKey)) ?? null;
    },
    async upsert(entity: StoredPreference) {
      rows.set(keyOf(entity.ownerUserId, entity.preferenceKey), entity);
    },
  };
}

function createResponse() {
  return {
    locals: {},
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

async function testServiceStoresPreferencesByUserAndKey() {
  const repository = createMemoryRepository();
  const service = new UserPreferencesService(repository as any);

  await service.savePreference({
    ownerUserId: "user-a",
    key: "filter.quoteAgent.documentReview",
    value: { status: "pending", limit: 10 },
  });
  await service.savePreference({
    ownerUserId: "user-b",
    key: "filter.quoteAgent.documentReview",
    value: { status: "approved", limit: 20 },
  });
  await service.savePreference({
    ownerUserId: "user-a",
    key: "filter.quoteAgent.documentReview",
    value: { status: "rejected", limit: 30 },
  });

  assert.deepEqual(
    await service.getPreference({
      ownerUserId: "user-a",
      key: "filter.quoteAgent.documentReview",
    }),
    {
      key: "filter.quoteAgent.documentReview",
      value: { status: "rejected", limit: 30 },
    },
  );
  assert.deepEqual(
    await service.getPreference({
      ownerUserId: "user-b",
      key: "filter.quoteAgent.documentReview",
    }),
    {
      key: "filter.quoteAgent.documentReview",
      value: { status: "approved", limit: 20 },
    },
  );
}

async function testServiceReturnsNullForMissingPreference() {
  const service = new UserPreferencesService(createMemoryRepository() as any);

  assert.deepEqual(
    await service.getPreference({
      ownerUserId: "user-a",
      key: "filter.missing",
    }),
    {
      key: "filter.missing",
      value: null,
    },
  );
}

async function testRoutesDecodeKeysAndValidateRequests() {
  const repository = createMemoryRepository();
  const service = new UserPreferencesService(repository as any);
  const routes = createUserPreferenceRoutes(service, async () => "route-user");
  const getRoute = routes.find((route) => route.method === "get")!;
  const putRoute = routes.find((route) => route.method === "put")!;
  const encodedKey = encodeURIComponent("filter.quoteAgent.documentReview");

  const putResponse = createResponse();
  await putRoute.action(
    {
      params: { key: encodedKey },
      body: { value: { status: "pending", limit: 10 } },
      headers: {},
    } as any,
    putResponse as any,
  );
  assert.equal(putResponse.statusCode, 200);
  assert.deepEqual(putResponse.payload, {
    key: "filter.quoteAgent.documentReview",
    value: { status: "pending", limit: 10 },
  });

  const getResponse = createResponse();
  await getRoute.action(
    {
      params: { key: encodedKey },
      headers: {},
    } as any,
    getResponse as any,
  );
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.payload, {
    key: "filter.quoteAgent.documentReview",
    value: { status: "pending", limit: 10 },
  });

  const badResponse = createResponse();
  await putRoute.action(
    {
      params: { key: encodedKey },
      body: {},
      headers: {},
    } as any,
    badResponse as any,
  );
  assert.equal(badResponse.statusCode, 400);
  assert.deepEqual(badResponse.payload, { error: "value is required" });
}

async function testRoutesRejectMissingUser() {
  const service = new UserPreferencesService(createMemoryRepository() as any);
  const routes = createUserPreferenceRoutes(service, async () => null);
  const getRoute = routes.find((route) => route.method === "get")!;
  const response = createResponse();

  await getRoute.action(
    {
      params: { key: "filter.quoteAgent.documentReview" },
      headers: {},
    } as any,
    response as any,
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.payload, { error: "Unauthorized" });
}

await testServiceStoresPreferencesByUserAndKey();
await testServiceReturnsNullForMissingPreference();
await testRoutesDecodeKeysAndValidateRequests();
await testRoutesRejectMissingUser();

console.log("frontend user preference tests passed");
