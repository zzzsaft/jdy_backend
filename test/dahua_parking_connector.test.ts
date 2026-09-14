import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { personApiClient } from "../src/features/dahua/api/person.js";
import { fileApiClient } from "../src/features/dahua/api/file.js";
import { parkingApiClient } from "../src/features/vehicle/api/app.js";

process.env.CONNECTOR_BASE_URL = "http://connect.fixture";
process.env.CONNECTOR_JDY_BACKEND_TOKEN = "fixture-module-token";

test("Dahua and parking preserve payloads, envelopes and binary uploads through Connect", async () => {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return new Response(JSON.stringify(String(url).endsWith("files/upload") ? { path: "faces/头像.jpg" } : { success: true, data: { id: "332265869940375552" } }));
  }) as typeof fetch;
  try {
    await personApiClient.addPersonFile({ name: "fixture", facePhotoPath: "faces/photo.jpg" });
    const person = JSON.parse(requests[0].init.body as string);
    assert.equal(requests[0].url, "http://connect.fixture/v1/providers/dahua/invoke");
    assert.equal(person.payload.orgCode, "001100");
    assert.equal(person.payload.storeId, "332265869940375552");
    await personApiClient.authAsync("synthetic-id");
    assert.equal(JSON.parse(requests[1].init.body as string).payload.length, 5);
    const car = { carNum: "fixture", carOwner: "fixture", phone: "", licensePlateColor: "blue", beginTime: "2026-09-14 00:00:00", endTime: "2026-09-15 00:00:00", userId: "fixture", area: "fixture" };
    const result = await parkingApiClient.addCar(car);
    assert.equal(result.data.id, "332265869940375552");
    assert.deepEqual(JSON.parse(requests[2].init.body as string), { method: "POST", path: "/openApi/addCarInfo", payload: car });
    await parkingApiClient.deleteCar("id & 中文");
    assert.deepEqual(JSON.parse(requests[3].init.body as string).query, { id: "id & 中文" });
    assert.equal(await fileApiClient.uploadFile(Readable.from([Buffer.from("a"), Buffer.from("b")]), "头像.jpg"), "faces/头像.jpg");
    const upload = requests[4];
    assert.equal(Buffer.from(upload.init.body as Uint8Array).toString(), "ab");
    assert.equal(new Headers(upload.init.headers).get("X-File-Name"), Buffer.from("头像.jpg").toString("base64url"));
    for (const { init } of requests) {
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer fixture-module-token");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
    }
  } finally { globalThis.fetch = original; }
});

test("upload rejects unsafe names and oversized streams; failures never retry", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { calls++; return new Response("failure", { status: 502 }); }) as typeof fetch;
  try {
    await assert.rejects(fileApiClient.uploadFile(Buffer.from("x"), "../photo.jpg"));
    await assert.rejects(fileApiClient.uploadFile(Readable.from([Buffer.alloc(8 * 1024 * 1024), Buffer.from("x")]), "photo.jpg"));
    assert.equal(calls, 0);
    await assert.rejects(fileApiClient.uploadFile(Buffer.from("x"), "photo.jpg"), /HTTP 502/);
    assert.equal(calls, 1);
    await assert.rejects(personApiClient.getOrgCode(), /HTTP 502/);
    assert.equal(calls, 2);
    assert.equal(await parkingApiClient.getCarById("fixture"), undefined);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
