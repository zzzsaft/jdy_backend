import assert from "node:assert/strict";
import { DictionaryService } from "./dictionary.service.js";

async function testMutationAndVersionShareTransaction() {
  const calls: string[] = [];
  const manager = {
    query: async () => {
      calls.push("version");
      return [{ versionValue: "2" }];
    },
  };
  const dataSource = {
    transaction: async (action: (value: any) => Promise<unknown>) => {
      calls.push("transaction:start");
      const result = await action(manager);
      calls.push("transaction:commit");
      return result;
    },
  } as any;
  const service = new DictionaryService(dataSource);
  service.reloadCache = async () => {
    calls.push("reload");
  };

  const result = await service.mutateDictionary(async (receivedManager) => {
    assert.equal(receivedManager, manager);
    calls.push("mutation");
    return "saved";
  });

  assert.equal(result, "saved");
  assert.deepEqual(calls, [
    "transaction:start",
    "mutation",
    "version",
    "transaction:commit",
    "reload",
  ]);
}

async function testFailureDoesNotReload() {
  let reloaded = false;
  const dataSource = {
    transaction: async (action: (value: any) => Promise<unknown>) =>
      action({ query: async () => [{ versionValue: "2" }] }),
  } as any;
  const service = new DictionaryService(dataSource);
  service.reloadCache = async () => {
    reloaded = true;
  };

  await assert.rejects(
    service.mutateDictionary(async () => {
      throw new Error("write failed");
    }),
    /write failed/,
  );
  assert.equal(reloaded, false);
}

async function testVersionFailureRollsBackAndDoesNotReload() {
  const calls: string[] = [];
  const dataSource = {
    transaction: async (action: (value: any) => Promise<unknown>) => {
      calls.push("transaction:start");
      try {
        return await action({
          query: async () => {
            throw new Error("version failed");
          },
        });
      } catch (error) {
        calls.push("transaction:rollback");
        throw error;
      }
    },
  } as any;
  const service = new DictionaryService(dataSource);
  service.reloadCache = async () => {
    calls.push("reload");
  };

  await assert.rejects(
    service.mutateDictionary(async () => {
      calls.push("mutation");
      return "saved";
    }),
    /version failed/,
  );
  assert.deepEqual(calls, ["transaction:start", "mutation", "transaction:rollback"]);
}

await testMutationAndVersionShareTransaction();
await testFailureDoesNotReload();
await testVersionFailureRollsBackAndDoesNotReload();
