import assert from "node:assert/strict";
import { mapArchiveItem, mapVersion } from "./contractArchive.mapper.js";

const mapped = mapVersion(
  {
    id: "1",
    archiveId: "2",
    version: 3,
    snapshotJsonb: { id: 2 },
    changeSummaryJsonb: [{ path: "docInfo.product_number.value" }],
    editedBy: "editor",
    editReason: "legacy_reason",
    createdAt: new Date("2026-06-15T00:00:00.000Z"),
  } as any,
  false,
);

assert.deepEqual(Object.keys(mapped), [
  "id",
  "archiveId",
  "version",
  "changeSummary",
  "snapshot",
  "editedBy",
  "createdAt",
]);
assert.equal(Object.hasOwn(mapped, "editReason"), false);

const enumsField = {
  field_name: "塑料材质",
  raw_value: "POM ABS",
  dictionary: {
    matched: true,
    field_matched: true,
    term_type: "plastic_material",
    value_kind: "enums",
    canonical_value: "pom",
    display_name: "POM",
    values: [
      {
        canonicalValue: "pom",
        displayName: "POM",
        rawValue: "POM",
        confidence: 1,
      },
      {
        canonicalValue: "abs",
        displayName: "ABS",
        rawValue: "ABS",
        confidence: 1,
      },
    ],
  },
};

const mappedItem = mapArchiveItem({
  id: "10",
  itemIndex: 0,
  itemName: "sample",
  itemQuantity: "1",
  productTypeHint: "plastic_part",
  productTypeRawValue: "塑料件",
  productTypeDisplayName: "塑料件",
  sourceProductNumber: "190666-E",
  productNumberStatus: "bound",
  fieldsJsonb: [enumsField],
  warningsJsonb: [],
  productBindings: [],
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:00.000Z"),
} as any);

assert.equal(mappedItem.fields[0].dictionary.value_kind, "enums");
assert.deepEqual(
  mappedItem.fields[0].dictionary.values.map((value: any) => value.canonicalValue),
  ["pom", "abs"],
);
assert.equal(mappedItem.fields[0].dictionary.canonical_value, "pom");

console.log("productConfigAgent contract archive mapper tests passed");
