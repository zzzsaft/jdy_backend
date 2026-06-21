import assert from "node:assert/strict";
import {
  extractMultiValueTokens,
  normalizeMultiEnumValues,
  splitPlasticMaterialPrefixTokens,
} from "./multiValue.js";
import { DictionaryService } from "./dictionary.service.js";
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

for (const [canonicalValue, displayName] of [
  ["pp", "PP"],
  ["pe", "PE"],
  ["eva", "EVA"],
  ["cpp", "CPP"],
  ["pvc", "PVC"],
  ["pet", "PET"],
  ["cpe", "CPE"],
] as const) {
  aliasMap.set(valueAliasKey("plastic_material", canonicalValue), {
    termType: "plastic_material",
    termId: canonicalValue,
    aliasId: `alias-${canonicalValue}`,
    canonicalValue,
    displayName,
    confidence: 1,
    riskLevel: "normal",
    note: null,
  });
}
aliasMap.set(valueAliasKey("application", "保鲜膜"), {
  termType: "application",
  termId: "application-preservative-film",
  aliasId: "alias-application-preservative-film",
  canonicalValue: "preservative_film",
  displayName: "保鲜膜",
  confidence: 1,
  riskLevel: "normal",
  note: null,
});

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

const prefixSplit = splitPlasticMaterialPrefixTokens("PP医用熔喷模头", aliasMap);
assert.deepEqual(
  prefixSplit?.tokens.map((token) => token.rawText),
  ["PP"],
);
assert.equal(prefixSplit?.split?.suffixRawValue, "医用熔喷模头");

const slashSplit = normalizeMultiEnumValues("PP/PE片材", materialTermType, {
  aliasMap,
});
assert.deepEqual(
  slashSplit.values.map((value) => value.displayName),
  ["PP", "PE"],
);
assert.equal(slashSplit.materialPrefixSplit?.suffixRawValue, "片材");
assert.deepEqual(slashSplit.unmatchedTokens, []);

const spaceSplit = normalizeMultiEnumValues("PP PE片材", materialTermType, {
  aliasMap,
});
assert.deepEqual(
  spaceSplit.values.map((value) => value.displayName),
  ["PP", "PE"],
);
assert.equal(spaceSplit.materialPrefixSplit?.suffixRawValue, "片材");

const plusSplit = normalizeMultiEnumValues("PP+PE+EVA流延膜", materialTermType, {
  aliasMap,
});
assert.deepEqual(
  plusSplit.values.map((value) => value.displayName),
  ["PP", "PE", "EVA"],
);
assert.equal(plusSplit.materialPrefixSplit?.suffixRawValue, "流延膜");

const ratioSplit = normalizeMultiEnumValues(
  "(25%)PP、PE+碳酸钙片材",
  materialTermType,
  { aliasMap },
);
assert.deepEqual(
  ratioSplit.values.map((value) => value.displayName),
  ["PP", "PE"],
);
assert.deepEqual(ratioSplit.unmatchedTokens, ["碳酸钙"]);
assert.equal(ratioSplit.materialPrefixSplit?.suffixRawValue, "片材");

const fillerSplit = normalizeMultiEnumValues(
  "PP+50%玉米淀粉片材模头",
  materialTermType,
  { aliasMap },
);
assert.deepEqual(
  fillerSplit.values.map((value) => value.displayName),
  ["PP"],
);
assert.deepEqual(fillerSplit.unmatchedTokens, ["玉米淀粉"]);
assert.equal(fillerSplit.materialPrefixSplit?.suffixRawValue, "片材模头");

const mixedIngredientSplit = normalizeMultiEnumValues(
  "PP+玉米淀粉",
  materialTermType,
  { aliasMap },
);
assert.deepEqual(
  mixedIngredientSplit.values.map((value) => value.displayName),
  ["PP"],
);
assert.deepEqual(mixedIngredientSplit.unmatchedTokens, ["玉米淀粉"]);
assert.equal(mixedIngredientSplit.materialPrefixSplit?.suffixRawValue, undefined);

const cppSplit = normalizeMultiEnumValues("CPP自动流延模头", materialTermType, {
  aliasMap,
});
assert.deepEqual(
  cppSplit.values.map((value) => value.displayName),
  ["CPP"],
);
assert.equal(cppSplit.materialPrefixSplit?.suffixRawValue, "自动流延模头");

const noKnownMaterial = normalizeMultiEnumValues(
  "XYZ自动流延模头",
  materialTermType,
  { aliasMap },
);
assert.deepEqual(noKnownMaterial.values, []);
assert.deepEqual(noKnownMaterial.unmatchedTokens, ["XYZ自动流延模头"]);
assert.equal(noKnownMaterial.materialPrefixSplit, undefined);

const nonMaterialTermType: CachedTermType = {
  ...materialTermType,
  termType: "surface_plating_type",
  displayName: "表面镀层",
  valueKind: "enums",
};
const nonMaterial = normalizeMultiEnumValues("PP医用熔喷模头", nonMaterialTermType, {
  aliasMap,
});
assert.deepEqual(nonMaterial.values, []);
assert.deepEqual(nonMaterial.unmatchedTokens, ["PP医用熔喷模头"]);
assert.equal(nonMaterial.materialPrefixSplit, undefined);

const createdCandidates: any[] = [];
const dictionaryService = new DictionaryService({} as any);
(dictionaryService as any).ensureCacheFresh = async () => {};
(dictionaryService as any).cache.termTypeAliasMap.set("适用塑料原料", [
  "plastic_material",
]);
(dictionaryService as any).cache.termTypeAliasMap.set("应用领域", [
  "application",
]);
(dictionaryService as any).cache.termTypeMap.set("plastic_material", {
  termType: "plastic_material",
  displayName: "塑料原料",
  valueKind: "enums",
  applicableProductTypes: ["common"],
  sortOrder: 1,
});
(dictionaryService as any).cache.termTypeMap.set("application", {
  termType: "application",
  displayName: "应用领域",
  valueKind: "enum",
  applicableProductTypes: ["common"],
  sortOrder: 2,
});
for (const [key, value] of aliasMap.entries()) {
  (dictionaryService as any).cache.valueAliasMap.set(key, value);
}
(dictionaryService as any).createValueCandidate = async (params: any) => {
  createdCandidates.push(params);
  return {
    id: String(createdCandidates.length),
    termType: params.termType,
    rawValue: params.rawValue,
    sourceProductType: params.sourceProductType,
    itemIndex: params.itemIndex,
    status: "pending",
  };
};

const serviceResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PP医用熔喷模头",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  serviceResult.values?.map((value) => value.displayName),
  ["PP"],
);
assert.equal(serviceResult.valueCandidate?.termType, "application");
assert.equal(serviceResult.valueCandidate?.rawValue, "医用熔喷模头");
assert.equal(serviceResult.materialPrefixSplit?.sourceRawValue, "PP医用熔喷模头");
assert.deepEqual(serviceResult.materialPrefixSplit?.matchedMaterialTokens, ["PP"]);
assert.equal(serviceResult.materialPrefixSplit?.suffixRawValue, "医用熔喷模头");
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    sourceRawValue: candidate.sourceRawValue,
    splitFromRawValue: candidate.splitFromRawValue,
    suffixCandidateTermType: candidate.evidence?.suffixCandidateTermType,
  })),
  [
    {
      termType: "application",
      rawValue: "医用熔喷模头",
      sourceRawValue: "PP医用熔喷模头",
      splitFromRawValue: "医用熔喷模头",
      suffixCandidateTermType: "application",
    },
  ],
);
assert.equal(
  serviceResult.warnings.some(
    (warning) => warning.type === "plastic_material_prefix_split_applied",
  ),
  true,
);

createdCandidates.length = 0;
const mixedMaterialResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PP+50%玉米淀粉片材模头",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  mixedMaterialResult.values?.map((value) => value.displayName),
  ["PP"],
);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    sourceRawValue: candidate.sourceRawValue,
    splitFromRawValue: candidate.splitFromRawValue,
    reason: candidate.reason,
    suffixCandidateTermType: candidate.evidence?.suffixCandidateTermType,
  })),
  [
    {
      termType: "application",
      rawValue: "片材模头",
      sourceRawValue: "PP+50%玉米淀粉片材模头",
      splitFromRawValue: "片材模头",
      reason: "plastic_material_prefix_suffix_application_candidate",
      suffixCandidateTermType: "application",
    },
  ],
);
assert.equal(
  mixedMaterialResult.materialPrefixSplit?.suffixRawValue,
  "片材模头",
);
assert.equal(
  mixedMaterialResult.warnings.some(
    (warning) => warning.type === "plastic_material_residual_suppressed",
  ),
  true,
);

createdCandidates.length = 0;
const additiveApplicationResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PE+石墨+助剂片材",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  additiveApplicationResult.values?.map((value) => value.displayName),
  ["PE"],
);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    reason: candidate.reason,
  })),
  [
    {
      termType: "application",
      rawValue: "片材",
      reason: "plastic_material_prefix_suffix_application_candidate",
    },
  ],
);

createdCandidates.length = 0;
const unknownMaterialApplicationResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PBAT降解膜流延膜自动模头",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(unknownMaterialApplicationResult.values ?? [], []);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    sourceRawValue: candidate.sourceRawValue,
    splitFromRawValue: candidate.splitFromRawValue,
    reason: candidate.reason,
  })),
  [
    {
      termType: "plastic_material",
      rawValue: "PBAT",
      sourceRawValue: "PBAT降解膜流延膜自动模头",
      splitFromRawValue: "PBAT",
      reason: "plastic_material_residual_material_prefix_candidate",
    },
    {
      termType: "application",
      rawValue: "降解膜流延膜自动模头",
      sourceRawValue: "PBAT降解膜流延膜自动模头",
      splitFromRawValue: "降解膜流延膜自动模头",
      reason: "plastic_material_residual_application_candidate",
    },
  ],
);

createdCandidates.length = 0;
const noisyMaterialResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PE+石墨+多种填料 线速度：5米/分 密度：1.4",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  noisyMaterialResult.values?.map((value) => value.displayName),
  ["PE"],
);
assert.deepEqual(createdCandidates, []);
assert.equal(
  noisyMaterialResult.warnings.some(
    (warning) => warning.type === "plastic_material_residual_suppressed",
  ),
  true,
);

createdCandidates.length = 0;
const processTemperatureMaterialResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PET（工艺温度：270-280度）",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  processTemperatureMaterialResult.values?.map((value) => value.displayName),
  ["PET"],
);
assert.deepEqual(createdCandidates, []);

createdCandidates.length = 0;
const outputMaterialResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "CPE（产量：150-200KG左右每小时）",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  outputMaterialResult.values?.map((value) => value.displayName),
  ["CPE"],
);
assert.deepEqual(createdCandidates, []);

createdCandidates.length = 0;
const literalHeaderMaterialResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "原料：EVA、POE 工艺温度：80-100 ℃ 正常使用产量：（155.3－1242.1 )kg以下/每小时",
  itemProductTypeHint: "metering_pump",
});
assert.deepEqual(
  literalHeaderMaterialResult.values?.map((value) => value.displayName),
  ["EVA"],
);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
  })),
  [
    {
      termType: "plastic_material",
      rawValue: "POE",
    },
  ],
);

createdCandidates.length = 0;
const applicationWithOutputResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PVC保鲜膜模头（产量500KG/每小时）",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  applicationWithOutputResult.values?.map((value) => value.displayName),
  ["PVC"],
);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    residualPart: candidate.evidence?.residualPart,
  })),
  [],
);

createdCandidates.length = 0;
const applicationPrefixResult = await dictionaryService.normalizeField({
  fieldName: "适用塑料原料",
  rawValue: "PP流延（既要做流延还得兼顾片）",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(
  applicationPrefixResult.values?.map((value) => value.displayName),
  ["PP"],
);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    residualPart: candidate.evidence?.residualPart,
    splitRule: candidate.evidence?.splitRule,
  })),
  [
    {
      termType: "application",
      rawValue: "流延",
      residualPart: "既要做流延还得兼顾片",
      splitRule: "plastic_material_residual_classifier",
    },
  ],
);

createdCandidates.length = 0;
const applicationMaterialPrefixResult = await dictionaryService.normalizeField({
  fieldName: "应用领域",
  rawValue: "PVC保鲜膜",
  itemProductTypeHint: "flat_die",
});
assert.deepEqual(applicationMaterialPrefixResult.values ?? [], []);
assert.deepEqual(
  (createdCandidates as any[]).map((candidate) => ({
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    sourceRawValue: candidate.sourceRawValue,
    splitFromRawValue: candidate.splitFromRawValue,
    reason: candidate.reason,
    materialPart: candidate.evidence?.materialPart,
    applicationLikePart: candidate.evidence?.applicationLikePart,
    splitRule: candidate.evidence?.splitRule,
  })),
  [
    {
      termType: "plastic_material",
      rawValue: "PVC",
      sourceRawValue: "PVC保鲜膜",
      splitFromRawValue: "PVC",
      reason: "application_material_prefix_material_candidate",
      materialPart: "PVC",
      applicationLikePart: "保鲜膜",
      splitRule: "application_material_prefix_split",
    },
    {
      termType: "application",
      rawValue: "保鲜膜",
      sourceRawValue: "PVC保鲜膜",
      splitFromRawValue: "保鲜膜",
      reason: "application_material_prefix_application_candidate",
      materialPart: "PVC",
      applicationLikePart: "保鲜膜",
      splitRule: "application_material_prefix_split",
    },
  ],
);

console.log("productConfigAgent dictionary multiValue tests passed");
