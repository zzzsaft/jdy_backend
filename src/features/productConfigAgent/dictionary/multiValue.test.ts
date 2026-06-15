import assert from "node:assert/strict";
import {
  extractMultiValueTokens,
  normalizeMultiEnumValues,
} from "./multiValue.js";
import { valueAliasKey } from "./dictionary.utils.js";
import type { CachedTermType, CachedValueAlias } from "./dictionary.types.js";

const materialTermType: CachedTermType = {
  termType: "plastic_material",
  displayName: "塑料材质",
  quoteDisplayName: null,
  category: null,
  sortOrder: 1,
  valueKind: "enums",
  applicableProductTypes: ["common"],
};

const aliasMap = new Map<string, CachedValueAlias>([
  [
    valueAliasKey("plastic_material", "pom"),
    {
      termType: "plastic_material",
      termId: "1",
      aliasId: "11",
      canonicalValue: "pom",
      displayName: "POM",
      confidence: 1,
      riskLevel: "normal",
      note: null,
    },
  ],
  [
    valueAliasKey("plastic_material", "abs"),
    {
      termType: "plastic_material",
      termId: "2",
      aliasId: "22",
      canonicalValue: "abs",
      displayName: "ABS",
      confidence: 1,
      riskLevel: "normal",
      note: null,
    },
  ],
]);

assert.deepEqual(
  extractMultiValueTokens("POM ABS  PC", undefined, "plastic_material").map(
    (token) => token.rawText,
  ),
  ["POM", "ABS", "PC"],
);

const normalized = normalizeMultiEnumValues("POM ABS PC", materialTermType, {
  aliasMap,
});

assert.deepEqual(
  normalized.values.map((value) => value.canonicalValue),
  ["pom", "abs"],
);
assert.deepEqual(normalized.unmatchedTokens, ["PC"]);
assert.equal(normalized.matched, true);

console.log("productConfigAgent dictionary multiValue tests passed");
