import assert from "node:assert/strict";
import { withTryAdvisoryLock } from "./advisoryLock.js";

async function testUsesOneQueryRunnerAndReleases() {
  const calls: string[] = [];
  const queryRunner = {
    connect: async () => calls.push("connect"),
    query: async (sql: string) => {
      calls.push(sql.includes("try") ? "lock" : "unlock");
      return sql.includes("try") ? [{ locked: true }] : [{ unlocked: true }];
    },
    release: async () => calls.push("release"),
  };
  const dataSource = { createQueryRunner: () => queryRunner } as any;

  const result = await withTryAdvisoryLock(dataSource, 1, async () => {
    calls.push("action");
    return "ok";
  });

  assert.deepEqual(result, { acquired: true, value: "ok" });
  assert.deepEqual(calls, ["connect", "lock", "action", "unlock", "release"]);
}

async function testContentionSkipsAction() {
  let actionCalled = false;
  let released = false;
  const dataSource = {
    createQueryRunner: () => ({
      connect: async () => undefined,
      query: async () => [{ locked: false }],
      release: async () => {
        released = true;
      },
    }),
  } as any;

  const result = await withTryAdvisoryLock(dataSource, 2, async () => {
    actionCalled = true;
  });

  assert.deepEqual(result, { acquired: false });
  assert.equal(actionCalled, false);
  assert.equal(released, true);
}

async function testActionFailureStillUnlocks() {
  const calls: string[] = [];
  const dataSource = {
    createQueryRunner: () => ({
      connect: async () => undefined,
      query: async (sql: string) => {
        calls.push(sql.includes("try") ? "lock" : "unlock");
        return sql.includes("try") ? [{ locked: true }] : [{ unlocked: true }];
      },
      release: async () => calls.push("release"),
    }),
  } as any;

  await assert.rejects(
    withTryAdvisoryLock(dataSource, 3, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.deepEqual(calls, ["lock", "unlock", "release"]);
}

async function testLockQueryFailureReleasesRunner() {
  let released = false;
  const dataSource = {
    createQueryRunner: () => ({
      connect: async () => undefined,
      query: async () => {
        throw new Error("lock query failed");
      },
      release: async () => {
        released = true;
      },
    }),
  } as any;

  await assert.rejects(
    withTryAdvisoryLock(dataSource, 4, async () => undefined),
    /lock query failed/,
  );
  assert.equal(released, true);
}

await testUsesOneQueryRunnerAndReleases();
await testContentionSkipsAction();
await testActionFailureStillUnlocks();
await testLockQueryFailureReleasesRunner();
