import assert from "node:assert/strict";
import { ExtractionNormalizationService } from "./extractionNormalization.service.js";

const dictionaryService = {
  async getProductTypeOptions() {
    return [];
  },
  async flushAliasUsageStats() {},
  async normalizeField() {
    throw new Error("docInfo raw fields should not be normalized as item fields");
  },
};

const service = new ExtractionNormalizationService({} as any, dictionaryService as any);

const result = await service.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {
        product_number: {
          value: "190666-E",
          evidence: { text: "产品编号：190666-E" },
          confidence: 0.98,
        },
      },
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "unknown", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "业务接单人",
              value: "华丽莎",
              evidence: { text: "业务接单人：华丽莎" },
              confidence: 0.98,
            },
            {
              field_name: "合同制作人",
              value: "华丽莎",
              evidence: { text: "合同制作人：华丽莎" },
              confidence: 0.98,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});

assert.deepEqual(result.items[0].fields, []);
assert.equal(
  (result.extraction_json.document_info as any).business_owner.value,
  "华丽莎",
);
assert.equal(
  (result.extraction_json.document_info as any).contract_creator.value,
  "华丽莎",
);
assert.equal(
  (result.extraction_json.document_info as any).product_number.value,
  "190666-E",
);

const numberUnitDictionaryService = {
  async getProductTypeOptions() {
    return [];
  },
  async flushAliasUsageStats() {},
  async normalizeField() {
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: "产量",
      normalizedFieldName: "throughput",
      rawValue: "3000-2000 kg/h",
      normalizedValue: "3000-2000 kg/h",
      termType: "throughput",
      valueKind: "number_unit",
      matchMethod: "term_type_only",
      numberUnit: {
        rawValue: "3000-2000 kg/h",
        numericText: "3000-2000",
        numberKind: "range",
        rangeStart: "3000",
        rangeEnd: "2000",
        rangeMin: "2000",
        rangeMax: "3000",
        unitRaw: "kg/h",
        normalizedUnitRaw: "kg/h",
        unitCanonical: "kg/h",
        displayUnit: "kg/h",
        normalizedValue: "3000-2000 kg/h",
        warnings: [],
      },
      warnings: [],
    };
  },
};
const numberUnitService = new ExtractionNormalizationService(
  {} as any,
  numberUnitDictionaryService as any,
);
const numberUnitResult = await numberUnitService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "unknown", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "产量",
              value: "3000-2000 kg/h",
              confidence: 0.9,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  numberUnitResult.extraction_json.items[0].fields[0].dictionary.number_unit,
  {
    rawValue: "3000-2000 kg/h",
    numericText: "3000-2000",
    numberKind: "range",
    rangeStart: "3000",
    rangeEnd: "2000",
    rangeMin: "2000",
    rangeMax: "3000",
    unitRaw: "kg/h",
    normalizedUnitRaw: "kg/h",
    unitCanonical: "kg/h",
    displayUnit: "kg/h",
    normalizedValue: "3000-2000 kg/h",
    warnings: [],
  },
);

console.log("productConfigAgent extraction normalization tests passed");
