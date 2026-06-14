import assert from "node:assert/strict";
import {
  assertAllowedArchivePatchChanges,
  assertAllowedArchivePatchChangesAgainstSnapshot,
  validateArchivePatchChanges,
} from "./jsonPatch.js";

assert.doesNotThrow(() =>
  assertAllowedArchivePatchChanges([
    { path: "docInfo.product_number.value" },
    { path: "docInfo.contract_number" },
    { path: "items.0.itemName" },
    { path: "items.1.itemQuantity" },
    { path: "items.2.fields" },
    { path: "items.2.warnings" },
  ]),
);

const rejected = validateArchivePatchChanges([
  { path: "currentVersion" },
  { path: "status" },
  { path: "id" },
  { path: "items.0.id" },
  { path: "items.0.productBindings" },
  { path: "items.0.fields.0.raw_value" },
  { path: "__proto__.polluted" },
  { path: "docInfo.unknown_key.value" },
]);

assert.deepEqual(
  rejected.map((item) => item.path),
  [
    "currentVersion",
    "status",
    "id",
    "items.0.id",
    "items.0.productBindings",
    "items.0.fields.0.raw_value",
    "__proto__.polluted",
    "docInfo.unknown_key.value",
  ],
);

assert.throws(
  () => assertAllowedArchivePatchChanges([{ path: "constructor.polluted" }]),
  /Patch contains non-editable paths: constructor\.polluted/,
);

assert.throws(
  () =>
    assertAllowedArchivePatchChangesAgainstSnapshot(
      { items: [{ id: "1", itemName: "old" }] },
      [{ path: "items.1.itemName" }],
    ),
  /archive item index does not exist/,
);

assert.doesNotThrow(() =>
  assertAllowedArchivePatchChangesAgainstSnapshot(
    { items: [{ id: "1", itemName: "old" }] },
    [{ path: "items.0.itemName" }],
  ),
);

console.log("productConfigAgent archive jsonPatch tests passed");
