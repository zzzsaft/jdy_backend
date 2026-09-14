import assert from "node:assert/strict";
import {
  getXftTaskStatus,
  isPendingXftTask,
} from "../src/features/xft/controller/xftTaskStatus.js";

assert.equal(isPendingXftTask("0"), true);
assert.equal(isPendingXftTask("1"), false);
assert.equal(isPendingXftTask("2"), false);

assert.equal(getXftTaskStatus("0", "0"), "审批中");
assert.equal(getXftTaskStatus("1", "0"), "已通过");
assert.equal(getXftTaskStatus("1", "1"), "已通过");
assert.equal(getXftTaskStatus("1", "2"), "已否决");
assert.equal(getXftTaskStatus("1", "3"), "已退回");
assert.equal(getXftTaskStatus("2", "0"), "已撤销");

console.log("xft task status tests passed");
