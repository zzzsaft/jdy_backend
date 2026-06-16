import assert from "node:assert/strict";
import { DictionaryService } from "./dictionary.service.js";

const service = new DictionaryService({} as any) as any;
service.matchTermType = async (fieldName: string) => ({
  matched: false,
  rawFieldName: fieldName,
  normalizedFieldName: service.normalizeText(fieldName),
  termTypes: [],
  matchMethod: "none",
});

(service.cache as any).valueAliasMap.set("deckle_type:外堵式", {
  termType: "deckle_type",
  termId: "1",
  aliasId: "1",
  canonicalValue: "outer_plug",
  displayName: "外堵式",
  confidence: 1,
  riskLevel: "normal",
  note: "test",
});
(service.cache as any).termTypeMap.set("deckle_type", {
  termType: "deckle_type",
  displayName: "堵边方式",
  quoteDisplayName: null,
  category: "structure",
  sortOrder: 10,
  valueKind: "enum",
  applicableProductTypes: ["flat_die"],
});
(service.cache as any).termTypeMap.set("surface_plating_type", {
  termType: "surface_plating_type",
  displayName: "表面镀层要求",
  quoteDisplayName: null,
  category: "surface",
  sortOrder: 20,
  valueKind: "enum",
  applicableProductTypes: ["feedblock", "flat_die", "common"],
});
(service.cache as any).valueAliasMap.set("lower_lip_adjustment_method:下模唇固定并可更换", {
  termType: "lower_lip_adjustment_method",
  termId: "2",
  aliasId: "2",
  canonicalValue: "fixed_replaceable_lower_lip",
  displayName: "下模唇固定可拆卸",
  confidence: 1,
  riskLevel: "normal",
  note: "test",
});
(service.cache as any).termTypeMap.set("lower_lip_adjustment_method", {
  termType: "lower_lip_adjustment_method",
  displayName: "下模唇调节方式",
  quoteDisplayName: null,
  category: "structure",
  sortOrder: 30,
  valueKind: "enum",
  applicableProductTypes: ["flat_die"],
});

const createdValueCandidates: any[] = [];
service.createValueCandidate = async (params: any) => {
  createdValueCandidates.push(params);
  return { id: "value-candidate-1", ...params };
};
service.createTermTypeCandidate = async () => {
  throw new Error("value-like field names should not create term type candidates");
};

const result = await service.normalizeField({
  documentId: "1",
  extractionResultId: "2",
  itemIndex: 1,
  itemProductTypeHint: "flat_die",
  fieldName: "外堵式",
  rawValue: "外堵式（单边挡300mm）",
  evidence: {},
});

assert.equal(result.fieldMatched, false);
assert.equal(result.termType, "deckle_type");
assert.equal(result.warnings[0].type, "value_like_field_name_moved_to_value_candidate");
assert.deepEqual(createdValueCandidates.map((item) => item.termType), [
  "deckle_type",
]);
assert.deepEqual(createdValueCandidates.map((item) => item.reason), [
  "value_like_field_name",
]);

const platingResult = await service.normalizeField({
  documentId: "1",
  extractionResultId: "2",
  itemIndex: 2,
  itemProductTypeHint: "feedblock",
  fieldName: "流道需要电镀处理",
  rawValue: "流道需要电镀处理",
  evidence: {},
});

assert.equal(platingResult.fieldMatched, false);
assert.equal(platingResult.termType, "surface_plating_type");
assert.equal(
  platingResult.warnings[0].type,
  "value_like_field_name_moved_to_value_candidate",
);
assert.deepEqual(createdValueCandidates.map((item) => item.termType), [
  "deckle_type",
  "surface_plating_type",
]);
assert.deepEqual(createdValueCandidates.map((item) => item.reason), [
  "value_like_field_name",
  "value_like_field_name",
]);
assert.equal(
  createdValueCandidates[1].evidence.valueLikeFieldNameReason,
  "raw_field_name_is_surface_plating_value_phrase",
);

const booleanValueResult = await service.normalizeField({
  documentId: "1",
  extractionResultId: "2",
  itemIndex: 3,
  itemProductTypeHint: "flat_die",
  fieldName: "下模唇固定并可更换",
  rawValue: "是",
  evidence: {},
});

assert.equal(booleanValueResult.fieldMatched, false);
assert.equal(booleanValueResult.termType, "lower_lip_adjustment_method");
assert.equal(createdValueCandidates[2].termType, "lower_lip_adjustment_method");
assert.equal(createdValueCandidates[2].rawValue, "下模唇固定并可更换");
assert.equal(createdValueCandidates[2].evidence.sourceRawValue, "是");

console.log("productConfigAgent value-like field name tests passed");
