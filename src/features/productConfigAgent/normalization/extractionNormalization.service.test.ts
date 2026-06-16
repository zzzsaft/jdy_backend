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
            {
              field_name: "使用地区",
              value: "国内使用",
              evidence: { text: "[SEL] 国内使用" },
              confidence: 0.95,
            },
            {
              field_name: "出口国家",
              value: "美国",
              evidence: { text: "[SEL] 出口使用 国家(美国)" },
              confidence: 0.95,
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
assert.equal(
  (result.extraction_json.document_info as any).usage_market.value,
  "国内使用",
);
assert.equal(
  (result.extraction_json.document_info as any).country.value,
  "美国",
);

const splitDocInfoResult = await service.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "unknown", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "出口信息",
              value: "出口使用 国家(美国)",
              evidence: { text: "[SEL] 出口使用 国家(美国)" },
              confidence: 0.95,
              split_fields: [
                {
                  field_name: "出口国家",
                  value: "美国",
                  evidence: { text: "国家(美国)" },
                  confidence: 0.95,
                },
              ],
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(
  (splitDocInfoResult.extraction_json.document_info as any).country.value,
  "美国",
);
assert.deepEqual(splitDocInfoResult.items[0].fields, []);

const exportInfoResult = await service.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "flat_die", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "\u51fa\u53e3\u4fe1\u606f",
              value: "\u51fa\u53e3\u4f7f\u7528\uff0c\u56fd\u5bb6\u5370\u5ea6",
              evidence: {
                text: "\u51fa\u53e3\u4f7f\u7528\uff0c\u56fd\u5bb6\u5370\u5ea6",
              },
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(
  (exportInfoResult.extraction_json.document_info as any).usage_market.value,
  "\u51fa\u53e3\u4f7f\u7528",
);
assert.equal(
  (exportInfoResult.extraction_json.document_info as any).country.value,
  "\u5370\u5ea6",
);
assert.deepEqual(exportInfoResult.items[0].fields, []);

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

const routedProductTypeHints: string[] = [];
const productTypeAliasDictionaryService = {
  async getProductTypeOptions() {
    return [
      {
        canonicalValue: "air_knife",
        displayName: "Air knife",
        aliases: ["\u98ce\u5200"],
      },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    routedProductTypeHints.push(params.itemProductTypeHint);
    return {
      matched: false,
      fieldMatched: false,
      rawFieldName: params.fieldName,
      normalizedFieldName: params.fieldName,
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      matchMethod: "none",
      warnings: [],
    };
  },
};
const productTypeAliasService = new ExtractionNormalizationService(
  {} as any,
  productTypeAliasDictionaryService as any,
);
await productTypeAliasService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          item_name: {
            value: "\u6d41\u5ef6\u819c\u98ce\u5200",
            confidence: 0.9,
          },
          product_type_hint: { value: "unknown", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "\u6750\u8d28",
              value: "SUS304",
              confidence: 0.9,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(routedProductTypeHints, ["air_knife"]);

const redirectedFieldCalls: Array<{ fieldName: string; itemProductTypeHint: string }> =
  [];
const redirectedFieldDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "flat_die", displayName: "Flat die", aliases: [] },
      { canonicalValue: "feedblock", displayName: "Feedblock", aliases: [] },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    redirectedFieldCalls.push({
      fieldName: params.fieldName,
      itemProductTypeHint: params.itemProductTypeHint,
    });
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: "die_effective_width",
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      termType: "die_effective_width",
      matchMethod: "alias_exact",
      warnings: [],
    };
  },
};
const redirectedFieldService = new ExtractionNormalizationService(
  {} as any,
  redirectedFieldDictionaryService as any,
);
const redirectedFieldResult = await redirectedFieldService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          item_name: { value: "\u6a21\u5934", confidence: 0.9 },
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [],
        },
        {
          item_index: 2,
          item_name: { value: "\u5206\u914d\u5668", confidence: 0.9 },
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "\u6a21\u5934\u6709\u6548\u5bbd\u5ea6",
              value: "1300mm",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(redirectedFieldCalls, [
  {
    fieldName: "\u6a21\u5934\u6709\u6548\u5bbd\u5ea6",
    itemProductTypeHint: "flat_die",
  },
]);
assert.equal(redirectedFieldResult.items[0].fields.length, 1);
assert.equal(redirectedFieldResult.items[1].fields.length, 0);
assert.equal(
  redirectedFieldResult.items[0].fields[0].warnings[0].type,
  "field_product_type_redirected",
);

const hydraulicRedirectCalls: Array<{
  fieldName: string;
  itemProductTypeHint: string;
}> = [];
const hydraulicRedirectDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "filter", displayName: "Filter", aliases: [] },
      {
        canonicalValue: "hydraulic_station",
        displayName: "Hydraulic station",
        aliases: [],
      },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    hydraulicRedirectCalls.push({
      fieldName: params.fieldName,
      itemProductTypeHint: params.itemProductTypeHint,
    });
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: "hydraulic_station_motor_power",
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      termType: "hydraulic_station_motor_power",
      matchMethod: "alias_exact",
      warnings: [],
    };
  },
};
const hydraulicRedirectService = new ExtractionNormalizationService(
  {} as any,
  hydraulicRedirectDictionaryService as any,
);
const hydraulicRedirectResult = await hydraulicRedirectService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          item_name: { value: "\u6362\u7f51\u5668", confidence: 0.9 },
          product_type_hint: { value: "filter", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "\u7535\u673a\u529f\u7387",
              value: "2.25KW",
              confidence: 0.95,
            },
          ],
        },
        {
          item_index: 2,
          item_name: { value: "\u6db2\u538b\u7ad9", confidence: 0.9 },
          product_type_hint: {
            value: "hydraulic_station",
            confidence: 0.9,
          },
          raw_fields: [],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(hydraulicRedirectCalls, [
  {
    fieldName: "\u7535\u673a\u529f\u7387",
    itemProductTypeHint: "hydraulic_station",
  },
]);
assert.equal(hydraulicRedirectResult.items[0].fields.length, 0);
assert.equal(hydraulicRedirectResult.items[1].fields.length, 1);
assert.equal(
  hydraulicRedirectResult.items[1].fields[0].warnings[0].type,
  "field_product_type_redirected",
);

const rangeBoundDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "metering_pump", displayName: "Metering pump", aliases: [] },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    const termType = params.fieldName === "\u8f6c\u901f"
      ? "rotation_speed"
      : "capacity";
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: params.fieldName,
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      termType,
      valueKind: "number_unit",
      matchMethod: "alias_exact",
      warnings: [],
    };
  },
};
const rangeBoundService = new ExtractionNormalizationService(
  {} as any,
  rangeBoundDictionaryService as any,
);
const rangeBoundResult = await rangeBoundService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "metering_pump", confidence: 0.9 },
          raw_fields: [
            { field_name: "\u4ea7\u91cf\u6700\u5c0f\u503c", value: "104", confidence: 0.9 },
            { field_name: "\u4ea7\u91cf\u6700\u5927\u503c", value: "936", confidence: 0.9 },
            { field_name: "\u8f6c\u901f\u6700\u5c0f\u503c", value: "10", confidence: 0.9 },
            { field_name: "\u8f6c\u901f\u6700\u5927\u503c", value: "90", confidence: 0.9 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  rangeBoundResult.items[0].fields.map((field) => ({
    fieldName: field.field_name,
    rawValue: field.raw_value,
    termType: field.dictionary.term_type,
    warningType: field.warnings.at(-1)?.type,
  })),
  [
    {
      fieldName: "\u4ea7\u91cf",
      rawValue: "104 - 936",
      termType: "capacity",
      warningType: "range_bound_fields_merged",
    },
    {
      fieldName: "\u8f6c\u901f",
      rawValue: "10 - 90",
      termType: "rotation_speed",
      warningType: "range_bound_fields_merged",
    },
  ],
);

console.log("productConfigAgent extraction normalization tests passed");
