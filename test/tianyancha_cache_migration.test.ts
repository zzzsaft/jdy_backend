import assert from "node:assert/strict";
import test from "node:test";
import { customerInfoCacheEntry, customerSearchCacheEntry } from "../src/scripts/migrateTianyanchaCacheToConnector.js";

test("legacy customer info is reconstructed as a Tianyancha base-info response", () => {
  const entry = customerInfoCacheEntry({
    id: 123,
    name: "存量企业有限公司",
    type: "公司",
    isMicroEnt: "是",
    estiblishTime: new Date("2020-01-02T00:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    staffList: [{ id: 1, name: "张三", position: ["经理"], type: "人" }],
    category: "制造业",
    categoryBig: "制造业",
    categoryMiddle: "设备制造",
    categorySmall: "泵制造",
  } as any);
  assert.equal(entry.operation, "base-info");
  assert.equal(entry.keyword, "存量企业有限公司");
  assert.equal((entry.response.result as any).isMicroEnt, 1);
  assert.equal((entry.response.result as any).estiblishTime, 1577923200000);
  assert.deepEqual((entry.response.result as any).staffList.result[0].typeJoin, ["经理"]);
});

test("legacy search rows are grouped into one Tianyancha search response", () => {
  const entry = customerSearchCacheEntry("精诚", [{
    id: 9,
    keyWord: "精诚",
    company_id: 456,
    name: "浙江精诚有限公司",
    type: "公司",
    companyType: "公司",
    estiblishTime: new Date("2010-01-01T00:00:00Z"),
    createdAt: new Date("2026-08-02T00:00:00Z"),
  } as any]);
  const result = entry.response.result as any;
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 456);
  assert.equal(result.items[0].companyType, 1);
  assert.equal(result.items[0].estiblishTime, 1262304000000);
});
