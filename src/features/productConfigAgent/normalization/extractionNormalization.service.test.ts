import assert from "node:assert/strict";
import { validateLlmExtractionResult } from "../extraction/validation/parseExtractResult.js";
import { ExtractionNormalizationService } from "./extractionNormalization.service.js";
import { classifyEnumResidual } from "../dictionary/dictionary.service.js";

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
              field_name: "出口/国内使用",
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
            {
              field_name: "客户",
              value: "路桥 开耀",
              evidence: { text: "客户：路桥 开耀" },
              confidence: 0.95,
            },
            {
              field_name: "发货方式",
              value: "汽运专车（自提）",
              evidence: { text: "发货方式：汽运专车（自提）" },
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
assert.equal(
  (result.extraction_json.document_info as any).customer_name.value,
  "路桥 开耀",
);
assert.equal(
  (result.extraction_json.document_info as any).shipping_method.value,
  "汽运专车（自提）",
);

const spinneretNumberResult = await service.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "spinneret_plate", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "喷丝板编号",
              value: "200844-900",
              evidence: { text: "喷丝板编号 200844-900" },
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
  (spinneretNumberResult.extraction_json.document_info as any).product_number
    .value,
  "200844-900",
);
assert.deepEqual(spinneretNumberResult.items[0].fields, []);

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

const exportCountryFieldResult = await service.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 0,
          product_type_hint: { value: "flat_die", confidence: 0.8 },
          raw_fields: [
            {
              field_name: "出口使用国家",
              value: "越南",
              evidence: { text: "出口使用国家：越南" },
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
  (exportCountryFieldResult.extraction_json.document_info as any).country.value,
  "越南",
);
assert.equal(
  (exportCountryFieldResult.extraction_json.document_info as any).usage_market
    .value,
  "出口使用",
);
assert.deepEqual(exportCountryFieldResult.items[0].fields, []);

const selectionSplitCalls: any[] = [];
const selectionSplitDictionaryService = {
  async getProductTypeOptions() {
    return [];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    selectionSplitCalls.push(params);
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: "product_material",
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      termType: "product_material",
      valueKind: "enum",
      matchMethod: "term_type_only",
      warnings: [],
    };
  },
};
const selectionSplitService = new ExtractionNormalizationService(
  { getRepository: () => ({ save: async () => {}, create: (value: any) => value }) } as any,
  selectionSplitDictionaryService as any,
);
const selectionSplitResult = await selectionSplitService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "产品材质",
              value: "A 1.2714A / B 1.2311A",
              raw_text: "A 1.2714A [SEL] B 1.2311A",
              evidence: {
                text: "Row 39: [ ] A 1.2714A [SEL] B 1.2311A",
              },
              confidence: 0.95,
              split_fields: [
                {
                  field_name: "材质选项（未选中）",
                  value: "A 1.2714A",
                },
                {
                  field_name: "材质选项（选中）",
                  value: "B 1.2311A",
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
assert.deepEqual(
  selectionSplitCalls.map((item) => ({
    fieldName: item.fieldName,
    rawValue: item.rawValue,
  })),
  [{ fieldName: "产品材质", rawValue: "B 1.2311A" }],
);
assert.equal(selectionSplitResult.items[0].fields.length, 2);
assert.equal(selectionSplitResult.items[0].fields[1].field_name, "产品材质");
assert.equal(selectionSplitResult.items[0].fields[1].raw_value, "B 1.2311A");
assert.equal(
  selectionSplitResult.warnings.some(
    (warning) => warning.type === "split_unselected_option_dropped",
  ),
  true,
);

const contradictoryUnselectedService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [];
    },
    async flushAliasUsageStats() {},
    async normalizeField() {
      throw new Error("unselected checkbox fields should not be normalized");
    },
  } as any,
);
const contradictoryUnselectedResult =
  await contradictoryUnselectedService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "coating_die", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "规格型号与原产品相同未选中",
                value: "不是",
                raw_text: "[ ] 是\n[ ] 不是\n[ ] 其他",
                selected: true,
                evidence: { text: "[ ] 是\n[ ] 不是\n[ ] 其他" },
                confidence: 0.5,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(contradictoryUnselectedResult.items[0].fields.length, 1);
assert.equal(
  contradictoryUnselectedResult.items[0].fields[0].dictionary.matched,
  false,
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
            { field_name: "\u6700\u5c0f\u4ea7\u91cf", value: "104", confidence: 0.9 },
            { field_name: "\u6700\u5927\u4ea7\u91cf", value: "936", confidence: 0.9 },
            { field_name: "\u6700\u5c0f\u8f6c\u901f", value: "10", confidence: 0.9 },
            { field_name: "\u6700\u5927\u8f6c\u901f", value: "90", confidence: 0.9 },
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

const numberUnitPartDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "metering_pump", displayName: "Metering pump", aliases: [] },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    const termType =
      params.fieldName === "\u8f6c\u901f"
        ? "rotation_speed"
        : "pump_displacement";
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
const numberUnitPartService = new ExtractionNormalizationService(
  {} as any,
  numberUnitPartDictionaryService as any,
);
const numberUnitPartResult = await numberUnitPartService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "metering_pump", confidence: 0.9 },
          raw_fields: [
            { field_name: "\u8f6c\u901f\u6570\u503c", value: "10-70", confidence: 0.9 },
            {
              field_name: "\u8f6c\u901f\u5355\u4f4d",
              value: "\u8f6c\u53ef\u8c03/\u6bcf\u5c0f\u65f6",
              confidence: 0.9,
            },
            { field_name: "\u6392\u91cf\u6570\u503c", value: "600kg\u4ee5\u4e0b", confidence: 0.9 },
            { field_name: "\u6392\u91cf\u5355\u4f4d", value: "\u6bcf\u5c0f\u65f6", confidence: 0.9 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  numberUnitPartResult.items[0].fields.map((field) => ({
    fieldName: field.field_name,
    rawValue: field.raw_value,
    termType: field.dictionary.term_type,
    warningType: field.warnings.at(-1)?.type,
  })),
  [
    {
      fieldName: "\u8f6c\u901f",
      rawValue: "10-70\u8f6c\u53ef\u8c03/\u6bcf\u5c0f\u65f6",
      termType: "rotation_speed",
      warningType: "number_unit_part_fields_merged",
    },
    {
      fieldName: "\u6392\u91cf",
      rawValue: "600kg\u4ee5\u4e0b/\u6bcf\u5c0f\u65f6",
      termType: "pump_displacement",
      warningType: "number_unit_part_fields_merged",
    },
  ],
);

const structuredFieldDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "feedblock", displayName: "Feedblock", aliases: [] },
      { canonicalValue: "flat_die", displayName: "Flat die", aliases: [] },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    if (params.fieldName === "\u5c42\u6bd4\u4f8b") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: "15%",
        termType: "layer_ratio",
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u6324\u51fa\u673a\u578b\u53f7") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "extruder_model",
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u5c42\u4ea7\u91cf") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "capacity",
        valueKind: "number_unit",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u5c42\u539f\u6599") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "plastic_material",
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u538b\u529b") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "pressure",
        valueKind: "number_unit",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u6a21\u5507\u6570\u91cf") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "lip_count",
        valueKind: "number_or_boolean",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u6a21\u5507\u539a\u5ea6") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "lip_gap",
        valueKind: "number_unit",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    if (params.fieldName === "\u9576\u5757\u6750\u8d28") {
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: "insert_block_material",
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    }
    throw new Error(`unexpected field: ${params.fieldName}`);
  },
};
const structuredFieldService = new ExtractionNormalizationService(
  {} as any,
  structuredFieldDictionaryService as any,
);
const structuredFieldResult = await structuredFieldService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            { field_name: "\u0041\u5c42\u6bd4\u4f8b", value: "15%", confidence: 0.9 },
            {
              field_name: "\u0044\u5c42\u6324\u51fa\u673a\u578b\u53f7",
              value: "\u03a6100",
              confidence: 0.9,
            },
            {
              field_name: "\u0042\u5c42\u4ea7\u91cf",
              value: "225 kg/h\u4ee5\u4e0b",
              confidence: 0.9,
            },
            {
              field_name: "\u0043\u5c42\u539f\u6599",
              value: "PS",
              confidence: 0.9,
            },
            {
              field_name: "\u6cf5\u540e\u538b\u529b",
              value: "30Mpa",
              confidence: 0.9,
            },
          ],
        },
        {
          item_index: 2,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "\u6a21\u5507\u6570\u91cf",
              value: "3",
              confidence: 0.9,
            },
            {
              field_name: "\u7b2c\u4e8c\u5957",
              value: "8mm",
              confidence: 0.9,
            },
            {
              field_name: "\u7b2c\u4e09\u5957\u6a21\u5507\u539a\u5ea6",
              value: "13mm",
              confidence: 0.9,
            },
            {
              field_name: "\u0043\u5165\u53e3\u9576\u5757\u6750\u8d28",
              value: "SUS630\u6750\u8d28",
              confidence: 0.9,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(
  structuredFieldResult.items[0].fields[0].dictionary.normalized_value,
  "\u5c42\u6bd4\u4f8b: 15%",
);
assert.equal(structuredFieldResult.items[0].fields[0].qualifier?.layer, "A");
assert.equal(
  structuredFieldResult.items[0].fields[1].dictionary.normalized_value,
  "\u6324\u51fa\u673a\u578b\u53f7: \u03a6100",
);
assert.equal(structuredFieldResult.items[0].fields[1].qualifier?.layer, "D");
assert.equal(
  structuredFieldResult.items[0].fields[2].dictionary.normalized_value,
  "\u6324\u51fa\u673a\u578b\u53f7: B\u5c42\u4ea7\u91cf=225 kg/h\u4ee5\u4e0b",
);
assert.equal(structuredFieldResult.items[0].fields[2].qualifier?.layer, "B");
assert.equal(
  structuredFieldResult.items[0].fields[3].dictionary.normalized_value,
  "\u6324\u51fa\u673a\u578b\u53f7: C\u5c42\u539f\u6599=PS",
);
assert.equal(structuredFieldResult.items[0].fields[3].qualifier?.layer, "C");
assert.equal(
  structuredFieldResult.items[0].fields[4].dictionary.normalized_value,
  "30Mpa",
);
assert.equal(structuredFieldResult.items[0].fields[4].field_name, "\u538b\u529b");
assert.equal(
  structuredFieldResult.items[0].fields[4].qualifier?.position,
  "post_pump",
);
assert.equal(
  structuredFieldResult.items[1].fields[1].field_name,
  "\u6a21\u5507\u539a\u5ea6",
);
assert.equal(
  structuredFieldResult.items[1].fields[1].dictionary.normalized_value,
  "8mm",
);
assert.equal(structuredFieldResult.items[1].fields[1].qualifier?.area, "lip");
assert.equal(structuredFieldResult.items[1].fields[1].qualifier?.instanceIndex, 2);
assert.equal(
  structuredFieldResult.items[1].fields[2].dictionary.normalized_value,
  "13mm",
);
assert.equal(structuredFieldResult.items[1].fields[2].field_name, "\u6a21\u5507\u539a\u5ea6");
assert.equal(structuredFieldResult.items[1].fields[2].qualifier?.area, "lip");
assert.equal(structuredFieldResult.items[1].fields[2].qualifier?.instanceIndex, 3);
assert.equal(
  structuredFieldResult.items[1].fields[3].dictionary.normalized_value,
  "\u9576\u5757\u6750\u8d28: SUS630\u6750\u8d28",
);
assert.equal(structuredFieldResult.items[1].fields[3].field_name, "\u9576\u5757\u6750\u8d28");
assert.equal(
  structuredFieldResult.items[1].fields[3].qualifier?.position,
  "c_inlet",
);
assert.equal(
  structuredFieldResult.items[1].fields[3].qualifier?.area,
  "insert_block",
);

const indexedInstanceCalls: string[] = [];
const indexedInstanceDictionaryService = {
  async getProductTypeOptions() {
    return [
      { canonicalValue: "filter", displayName: "\u6362\u7f51\u5668", aliases: [] },
    ];
  },
  async flushAliasUsageStats() {},
  async normalizeField(params: any) {
    indexedInstanceCalls.push(params.fieldName);
    const termTypes: Record<string, string> = {
      "\u5c3a\u5bf8": "dimension",
      "\u91cd\u91cf": "weight",
      "\u6ee4\u7f51\u76f4\u5f84": "filter_screen_diameter",
    };
    const termType = termTypes[params.fieldName];
    if (!termType) {
      throw new Error(`unexpected indexed instance field: ${params.fieldName}`);
    }
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: params.fieldName,
      normalizedFieldName: params.fieldName,
      rawValue: params.rawValue,
      normalizedValue: params.rawValue,
      termType,
      valueKind: "text",
      matchMethod: "term_type_only",
      warnings: [],
    };
  },
};
const indexedInstanceService = new ExtractionNormalizationService(
  {} as any,
  indexedInstanceDictionaryService as any,
);
const indexedInstanceResult = await indexedInstanceService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 12,
          product_type_hint: { value: "filter", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "\u5c3a\u5bf81",
              value: "L1(125mm), L2(835mm), L3(220mm)",
              confidence: 0.9,
            },
            {
              field_name: "\u5c3a\u5bf82",
              value: "L1(165mm), L2(1000mm), L3(270mm)",
              confidence: 0.9,
            },
            {
              field_name: "\u91cd\u91cf1",
              value: "700kg",
              confidence: 0.9,
            },
            {
              field_name: "\u6ee4\u7f51\u76f4\u5f842",
              value: "145mm",
              confidence: 0.9,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(indexedInstanceCalls, [
  "\u5c3a\u5bf8",
  "\u91cd\u91cf",
  "\u5c3a\u5bf8",
  "\u6ee4\u7f51\u76f4\u5f84",
]);
assert.deepEqual(
  indexedInstanceResult.items.map((item) => ({
    itemIndex: item.item_index,
    fields: item.fields.map((field) => field.field_name),
  })),
  [
    {
      itemIndex: 12,
      fields: ["\u5c3a\u5bf8", "\u91cd\u91cf"],
    },
    {
      itemIndex: 1,
      fields: ["\u5c3a\u5bf8", "\u6ee4\u7f51\u76f4\u5f84"],
    },
  ],
);
assert.equal(
  indexedInstanceResult.warnings.some(
    (warning) => warning.type === "item_instance_split_from_indexed_fields",
  ),
  true,
);

const indexedInstanceThreeCalls: Array<{ fieldName: string; rawValue: string }> = [];
const indexedInstanceThreeService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [
        { canonicalValue: "filter", displayName: "\u6362\u7f51\u5668", aliases: [] },
      ];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      indexedInstanceThreeCalls.push({
        fieldName: params.fieldName,
        rawValue: params.rawValue,
      });
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: params.fieldName,
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    },
  } as any,
);
const indexedInstanceThreeResult =
  await indexedInstanceThreeService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 2,
            item_quantity: { value: "3\u5957", confidence: 0.9 },
            product_type_hint: { value: "filter", confidence: 0.9 },
            raw_fields: [
              { field_name: "\u5c3a\u5bf81", value: "A", confidence: 0.9 },
              { field_name: "\u5c3a\u5bf82", value: "B", confidence: 0.9 },
              { field_name: "\u5c3a\u5bf83", value: "C", confidence: 0.9 },
              { field_name: "\u91cd\u91cf1", value: "10kg", confidence: 0.9 },
              { field_name: "\u91cd\u91cf2", value: "20kg", confidence: 0.9 },
              { field_name: "\u91cd\u91cf3", value: "30kg", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.deepEqual(
  indexedInstanceThreeResult.items.map((item) => ({
    itemIndex: item.item_index,
    values: item.fields.map((field) => field.raw_value),
  })),
  [
    { itemIndex: 2, values: ["A", "10kg"] },
    { itemIndex: 1, values: ["B", "20kg"] },
    { itemIndex: 3, values: ["C", "30kg"] },
  ],
);
assert.deepEqual(
  indexedInstanceThreeCalls.map((call) => call.fieldName),
  ["\u5c3a\u5bf8", "\u91cd\u91cf", "\u5c3a\u5bf8", "\u91cd\u91cf", "\u5c3a\u5bf8", "\u91cd\u91cf"],
);

const indexedInstanceModelSplitCalls: Array<{ fieldName: string; rawValue: string }> = [];
const indexedInstanceModelSplitService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [
        { canonicalValue: "filter", displayName: "\u6362\u7f51\u5668", aliases: [] },
      ];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      indexedInstanceModelSplitCalls.push({
        fieldName: params.fieldName,
        rawValue: params.rawValue,
      });
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: params.fieldName === "\u8fc7\u6ee4\u5668\u578b\u53f7" ? "filter_model" : params.fieldName,
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    },
  } as any,
);
const indexedInstanceModelSplitResult =
  await indexedInstanceModelSplitService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 30,
            product_type_hint: { value: "filter", confidence: 0.9 },
            raw_fields: [
              { field_name: "\u5c3a\u5bf81", value: "A", confidence: 0.9 },
              { field_name: "\u5c3a\u5bf82", value: "B", confidence: 0.9 },
              {
                field_name: "\u6362\u7f51\u5668\u89c4\u683c\u578b\u53f7\u53ca\u6570\u91cf",
                value: "GD-DP-A-120:1\u5957, GD-DP-A-145:1\u5957",
                confidence: 0.9,
                split_fields: [
                  {
                    field_name: "\u8fc7\u6ee4\u5668\u578b\u53f7",
                    value: "GD-DP-A-120",
                    confidence: 0.9,
                  },
                  {
                    field_name: "\u8fc7\u6ee4\u5668\u578b\u53f7",
                    value: "GD-DP-A-145",
                    confidence: 0.9,
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
assert.deepEqual(
  indexedInstanceModelSplitResult.items.map((item) =>
    item.fields
      .filter((field) => field.field_name === "\u8fc7\u6ee4\u5668\u578b\u53f7")
      .map((field) => field.raw_value),
  ),
  [["GD-DP-A-120"], ["GD-DP-A-145"]],
);

const meteringPumpInstanceCalls: string[] = [];
const meteringPumpInstanceService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [
        { canonicalValue: "metering_pump", displayName: "\u8ba1\u91cf\u6cf5", aliases: [] },
      ];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      meteringPumpInstanceCalls.push(params.fieldName);
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: params.fieldName,
        valueKind: "number_unit",
        matchMethod: "term_type_only",
        warnings: [],
      };
    },
  } as any,
);
const meteringPumpInstanceResult =
  await meteringPumpInstanceService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 4,
            item_quantity: { value: "3\u53f0", confidence: 0.9 },
            product_type_hint: { value: "metering_pump", confidence: 0.9 },
            raw_fields: [
              { field_name: "\u6392\u91cf1", value: "10ccm", confidence: 0.9 },
              { field_name: "\u6392\u91cf2", value: "20ccm", confidence: 0.9 },
              { field_name: "\u6392\u91cf3", value: "30ccm", confidence: 0.9 },
              { field_name: "\u8f6c\u901f1", value: "10rpm", confidence: 0.9 },
              { field_name: "\u8f6c\u901f2", value: "20rpm", confidence: 0.9 },
              { field_name: "\u8f6c\u901f3", value: "30rpm", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(meteringPumpInstanceResult.items.length, 3);
assert.deepEqual(meteringPumpInstanceCalls, [
  "\u6392\u91cf",
  "\u8f6c\u901f",
  "\u6392\u91cf",
  "\u8f6c\u901f",
  "\u6392\u91cf",
  "\u8f6c\u901f",
]);

const indexedInstanceReviewCalls: string[] = [];
const indexedInstanceReviewService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      indexedInstanceReviewCalls.push(params.fieldName);
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: params.fieldName,
        valueKind: "text",
        matchMethod: "term_type_only",
        warnings: [],
      };
    },
  } as any,
);
const indexedInstanceReviewResult =
  await indexedInstanceReviewService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 9,
            product_type_hint: { value: "unknown", confidence: 0.6 },
            raw_fields: [
              { field_name: "\u5c3a\u5bf81", value: "A", confidence: 0.9 },
              { field_name: "\u5c3a\u5bf83", value: "C", confidence: 0.9 },
            ],
          },
          {
            item_index: 10,
            product_type_hint: { value: "unknown", confidence: 0.6 },
            raw_fields: [
              { field_name: "\u5c3a\u5bf83", value: "C", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(indexedInstanceReviewResult.items.length, 2);
assert.deepEqual(indexedInstanceReviewCalls, [
  "\u5c3a\u5bf8",
  "\u5c3a\u5bf8",
  "\u5c3a\u5bf8",
]);
assert.equal(
  indexedInstanceReviewResult.warnings.filter(
    (warning) => warning.type === "possible_indexed_instance_fields_needs_review",
  ).length,
  2,
);
assert.equal(
  indexedInstanceReviewResult.items[1].fields[0].warnings[0].type,
  "indexed_instance_field_normalized",
);

const indexedInstanceCandidateService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      return {
        matched: false,
        fieldMatched: false,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        matchMethod: "none",
        warnings: [],
        termTypeCandidate: {
          id: "candidate-1",
          rawFieldName: params.fieldName,
          sourceProductType: params.itemProductTypeHint,
          itemIndex: params.itemIndex,
          status: "pending",
        },
      };
    },
  } as any,
);
const indexedInstanceCandidateResult =
  await indexedInstanceCandidateService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 20,
            product_type_hint: { value: "unknown", confidence: 0.6 },
            raw_fields: [
              { field_name: "\u672a\u77e5\u5b57\u6bb51", value: "A", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(indexedInstanceCandidateResult.items[0].fields[0].candidate, undefined);
assert.equal(
  indexedInstanceCandidateResult.items[0].fields[0].warnings.some(
    (warning) => warning.type === "indexed_instance_field_normalized",
  ),
  true,
);

function attributeMatchService(params: {
  normalizeField: (input: any) => any;
  matchModelByAttributes: (input: any) => any;
}) {
  return new ExtractionNormalizationService(
    {} as any,
    {
      async getProductTypeOptions() {
        return [
          { canonicalValue: "filter", displayName: "\u6362\u7f51\u5668", aliases: [] },
          { canonicalValue: "metering_pump", displayName: "\u8ba1\u91cf\u6cf5", aliases: [] },
        ];
      },
      async flushAliasUsageStats() {},
      async normalizeField(input: any) {
        return params.normalizeField(input);
      },
    } as any,
    {
      async matchModelByAttributes(input: any) {
        return params.matchModelByAttributes(input);
      },
    } as any,
  );
}

const missingModelAttributeService = attributeMatchService({
  normalizeField(input) {
    const termTypeByFieldName: Record<string, string> = {
      "\u5c3a\u5bf8": "dimension",
      "\u91cd\u91cf": "weight",
      "\u6ee4\u7f51\u76f4\u5f84": "filter_diameter",
      "\u6709\u6548\u8fc7\u6ee4\u9762\u79ef": "effective_filter_area",
    };
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: input.fieldName,
      normalizedFieldName: input.fieldName,
      rawValue: input.rawValue,
      normalizedValue: input.rawValue,
      termType: termTypeByFieldName[input.fieldName],
      valueKind: "text",
      matchMethod: "term_type_only",
      warnings: [],
    };
  },
  matchModelByAttributes(input) {
    assert.equal(input.termType, "filter_model");
    return {
      reason: "matched",
      matchedAttributes: ["dimension", "weight"],
      candidateCount: 1,
      candidates: [],
      masterDataMatch: {
        matched: true,
        source: "crm_product_filter",
        id: "1",
        model: "GD-DP-A-120",
        rawValue: "GD-DP-A-120",
        matchMethod: "attributes_unique_exact",
        details: { matchedAttributes: ["dimension", "weight"] },
      },
    };
  },
});
const missingModelAttributeResult =
  await missingModelAttributeService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "filter", confidence: 0.9 },
            raw_fields: [
              { field_name: "\u5c3a\u5bf8", value: "L1(125mm)", confidence: 0.9 },
              { field_name: "\u91cd\u91cf", value: "305kg", confidence: 0.9 },
              { field_name: "\u6ee4\u7f51\u76f4\u5f84", value: "\u03a6100mm", confidence: 0.9 },
              { field_name: "\u6709\u6548\u8fc7\u6ee4\u9762\u79ef", value: "2\u00d778CM2", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(
  missingModelAttributeResult.items[0].masterDataMatch?.model,
  "GD-DP-A-120",
);
assert.equal(
  missingModelAttributeResult.items[0].warnings.some(
    (warning) => warning.type === "master_data_attribute_match_applied",
  ),
  true,
);

let failedModelAttributeCalled = false;
const failedModelAttributeService = attributeMatchService({
  normalizeField(input) {
    const termTypeByFieldName: Record<string, string> = {
      "\u8fc7\u6ee4\u5668\u578b\u53f7": "filter_model",
      "\u5c3a\u5bf8": "dimension",
      "\u91cd\u91cf": "weight",
    };
    const termType = termTypeByFieldName[input.fieldName];
    return {
      matched: termType !== "filter_model",
      fieldMatched: true,
      rawFieldName: input.fieldName,
      normalizedFieldName: input.fieldName,
      rawValue: input.rawValue,
      normalizedValue: input.rawValue,
      termType,
      valueKind: "text",
      matchMethod: "term_type_only",
      masterDataMatch:
        termType === "filter_model"
          ? {
              matched: false,
              source: "crm_product_filter",
              rawValue: input.rawValue,
            }
          : undefined,
      warnings:
        termType === "filter_model"
          ? [
              {
                type: "master_data_no_match",
                message: "no model",
                rawValue: input.rawValue,
                termType,
                source: "crm_product_filter",
              },
            ]
          : [],
    };
  },
  matchModelByAttributes() {
    failedModelAttributeCalled = true;
    return {
      reason: "matched",
      matchedAttributes: ["dimension", "weight"],
      candidateCount: 1,
      candidates: [],
      masterDataMatch: {
        matched: true,
        source: "crm_product_filter",
        id: "2",
        model: "GD-DP-A-145",
        rawValue: "GD-DP-A-145",
        matchMethod: "attributes_unique_exact",
        details: {},
      },
    };
  },
});
const failedModelAttributeResult =
  await failedModelAttributeService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 2,
            product_type_hint: { value: "filter", confidence: 0.9 },
            raw_fields: [
              { field_name: "\u8fc7\u6ee4\u5668\u578b\u53f7", value: "UNKNOWN-MODEL", confidence: 0.9 },
              { field_name: "\u5c3a\u5bf8", value: "L1(165mm)", confidence: 0.9 },
              { field_name: "\u91cd\u91cf", value: "490kg", confidence: 0.9 },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(failedModelAttributeCalled, true);
const failedModelField = failedModelAttributeResult.items[0].fields.find(
  (field) => field.dictionary.term_type === "filter_model",
);
assert.equal(failedModelField?.dictionary.masterDataMatch?.model, "GD-DP-A-145");
assert.equal(
  failedModelField?.warnings.some(
    (warning) => warning.type === "master_data_no_match",
  ),
  false,
);

const duplicateAttributeService = attributeMatchService({
  normalizeField(input) {
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: input.fieldName,
      normalizedFieldName: input.fieldName,
      rawValue: input.rawValue,
      normalizedValue: input.rawValue,
      termType: input.fieldName === "\u5c3a\u5bf8" ? "dimension" : "weight",
      valueKind: "text",
      matchMethod: "term_type_only",
      warnings: [],
    };
  },
  matchModelByAttributes() {
    return {
      reason: "multiple_matches",
      matchedAttributes: [],
      candidateCount: 2,
      candidates: [
        { id: "1", model: "A", source: "crm_product_filter", matchedAttributes: ["dimension", "weight"], details: {} },
        { id: "2", model: "B", source: "crm_product_filter", matchedAttributes: ["dimension", "weight"], details: {} },
      ],
      masterDataMatch: {
        matched: false,
        source: "crm_product_filter",
        rawValue: "",
      },
    };
  },
});
const duplicateAttributeResult = await duplicateAttributeService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 3,
          product_type_hint: { value: "filter", confidence: 0.9 },
          raw_fields: [
            { field_name: "\u5c3a\u5bf8", value: "100mm", confidence: 0.9 },
            { field_name: "\u91cd\u91cf", value: "10kg", confidence: 0.9 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(duplicateAttributeResult.items[0].masterDataMatch, undefined);
assert.equal(
  duplicateAttributeResult.warnings.some(
    (warning) => warning.type === "master_data_attribute_match_needs_review",
  ),
  true,
);

let exactModelAttributeCalled = false;
const exactModelService = attributeMatchService({
  normalizeField(input) {
    const termType =
      input.fieldName === "\u8fc7\u6ee4\u5668\u578b\u53f7"
        ? "filter_model"
        : "dimension";
    return {
      matched: true,
      fieldMatched: true,
      rawFieldName: input.fieldName,
      normalizedFieldName: input.fieldName,
      rawValue: input.rawValue,
      normalizedValue: input.rawValue,
      termType,
      valueKind: "text",
      matchMethod: "term_type_only",
      masterDataMatch:
        termType === "filter_model"
          ? {
              matched: true,
              source: "crm_product_filter",
              id: "1",
              model: "GD-DP-A-120",
              rawValue: input.rawValue,
              matchMethod: "model_exact",
            }
          : undefined,
      warnings: [],
    };
  },
  matchModelByAttributes() {
    exactModelAttributeCalled = true;
    throw new Error("attribute match should not run when model already matched");
  },
});
const exactModelResult = await exactModelService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 4,
          product_type_hint: { value: "filter", confidence: 0.9 },
          raw_fields: [
            { field_name: "\u8fc7\u6ee4\u5668\u578b\u53f7", value: "GD-DP-A-120", confidence: 0.9 },
            { field_name: "\u5c3a\u5bf8", value: "L1(125mm)", confidence: 0.9 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(exactModelAttributeCalled, false);
assert.equal(
  exactModelResult.items[0].fields.find(
    (field) => field.dictionary.term_type === "filter_model",
  )?.dictionary.masterDataMatch?.matchMethod,
  "model_exact",
);

const normalizationRulesService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      const termTypes: Record<string, { termType: string; valueKind: string }> = {
        是否有阻流棒: { termType: "choker_bar_config", valueKind: "boolean" },
        上模是否有阻流棒: { termType: "choker_bar_config", valueKind: "boolean" },
        上下模是否有阻流棒: { termType: "choker_bar_config", valueKind: "boolean" },
        上模加热棒角度: { termType: "heating_rod_angle", valueKind: "number_unit" },
        下模加热棒角度: { termType: "heating_rod_angle", valueKind: "number_unit" },
        加热棒角度: { termType: "heating_rod_angle", valueKind: "number_unit" },
        加热棒配置: { termType: "heating_rod_config", valueKind: "boolean" },
        热电偶孔: { termType: "thermocouple_hole", valueKind: "number_or_boolean" },
        测温孔方向: { termType: "thermocouple_hole_direction", valueKind: "enum" },
        heating_voltage: { termType: "heating_voltage", valueKind: "number_unit" },
        heating_frequency: { termType: "heating_frequency", valueKind: "number_unit" },
        heating_phase: { termType: "heating_phase", valueKind: "enum" },
        pump_heating_voltage: { termType: "pump_heating_voltage", valueKind: "number_unit" },
        加热电压: { termType: "heating_voltage", valueKind: "number_unit" },
        加热频率: { termType: "heating_frequency", valueKind: "number_unit" },
        相: { termType: "heating_phase", valueKind: "enum" },
        加热功率: { termType: "heating_power", valueKind: "number_unit" },
        镶块粗糙度: { termType: "surface_roughness", valueKind: "text" },
        流道抛光精度: { termType: "surface_roughness", valueKind: "text" },
        热电偶孔规格: {
          termType: "thermocouple_hole_specification",
          valueKind: "text",
        },
        压力传感器孔配置: {
          termType: "pressure_sensor_hole_config",
          valueKind: "boolean",
        },
        压力孔: {
          termType: "pressure_sensor_hole_config",
          valueKind: "boolean",
        },
        压力: { termType: "pressure", valueKind: "number_unit" },
        模唇厚度: {
          termType: "lip_thickness_adjustment_range",
          valueKind: "number_unit",
        },
        连接器配置: { termType: "connector_config", valueKind: "boolean" },
        电压: { termType: "heating_voltage", valueKind: "number_unit" },
        层比例: { termType: "layer_ratio", valueKind: "text" },
        层原料: { termType: "layer_material", valueKind: "text" },
        层产量: { termType: "layer_output", valueKind: "number_unit" },
        挤出机型号: { termType: "extruder_model", valueKind: "text" },
        加热配置: { termType: "heating_config", valueKind: "boolean" },
        两侧板加热: { termType: "side_plate_heating_config", valueKind: "boolean" },
        模唇加热配置: { termType: "die_lip_heating_config", valueKind: "boolean" },
        模唇加热方式: { termType: "heating_method", valueKind: "enum" },
        侧板材质: { termType: "side_plate_material", valueKind: "enum" },
        侧板接插件: { termType: "side_plate_connector", valueKind: "boolean" },
        下模唇开档: { termType: "lower_lip_gap", valueKind: "number_unit" },
        唇开档: { termType: "lower_lip_gap", valueKind: "number_unit" },
        备注: { termType: "remark", valueKind: "text" },
      };
      const meta = termTypes[params.fieldName] ?? {
        termType: params.fieldName,
        valueKind: "text",
      };
      return {
        matched: true,
        fieldMatched: true,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termType: meta.termType,
        valueKind: meta.valueKind,
        numberUnit:
          meta.valueKind === "number_unit"
            ? {
                rawValue: params.rawValue,
                numericText: String(params.rawValue).replace(/[^0-9.]/g, ""),
                numberKind: "single",
                unitRaw: String(params.rawValue).replace(/[0-9.\s]/g, ""),
                normalizedValue: params.rawValue,
                warnings: [],
              }
            : undefined,
        canonicalValue:
          meta.valueKind === "enum" ? params.rawValue : undefined,
        displayName:
          meta.valueKind === "enum" ? params.rawValue : undefined,
        matchMethod: "term_type_only",
        warnings: [],
      };
    },
  } as any,
);

const qualifierResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "上模是否有阻流棒",
              value: "有",
              evidence: { text: "上模是否有阻流棒：有" },
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(qualifierResult.items[0].fields[0].dictionary.term_type, "choker_bar_config");
assert.equal(qualifierResult.items[0].fields[0].field_name, "是否有阻流棒");
assert.equal(qualifierResult.items[0].fields[0].qualifier?.position, "upper_die");
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).originalFieldName,
  "上模是否有阻流棒",
);
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).baseFieldName,
  "是否有阻流棒",
);
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).matchedQualifierAlias,
  "上模",
);
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).qualifierKey,
  "upper_die",
);
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).qualifierKind,
  "position",
);
assert.equal(
  (qualifierResult.items[0].fields[0].evidence as any).rule,
  "runtime_qualifier_matcher",
);
assert.equal(
  qualifierResult.extraction_json.items[0].fields[0].qualifier?.position,
  "upper_die",
);

const expandedQualifierAllowlistResult =
  await normalizationRulesService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "metering_pump", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "泵前压力",
                value: "20MPa",
                confidence: 0.95,
              },
              {
                field_name: "连接器配置",
                value: "有",
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
  expandedQualifierAllowlistResult.items[0].fields[0].dictionary.term_type,
  "pressure",
);
assert.equal(
  expandedQualifierAllowlistResult.items[0].fields[0].qualifier?.position,
  "pre_pump",
);
assert.equal(
  expandedQualifierAllowlistResult.items[0].fields[1].dictionary.term_type,
  "connector_config",
);
assert.equal(expandedQualifierAllowlistResult.items[0].fields[1].qualifier?.area, "connector");

const runtimeQualifierCoreScenariosResult =
  await normalizationRulesService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "flat_die", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "上模热电偶孔",
                value: "有",
                confidence: 0.95,
              },
              {
                field_name: "网后压力孔",
                value: "有",
                confidence: 0.95,
              },
              {
                field_name: "第2套模唇厚度",
                value: "1.2mm",
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.deepEqual(
  runtimeQualifierCoreScenariosResult.items[0].fields.map((field) => ({
    fieldName: field.field_name,
    termType: field.dictionary.term_type,
    position: field.qualifier?.position,
    area: field.qualifier?.area,
    instanceIndex: field.qualifier?.instanceIndex,
  })),
  [
    {
      fieldName: "热电偶孔",
      termType: "thermocouple_hole",
      position: "upper_die",
      area: undefined,
      instanceIndex: undefined,
    },
    {
      fieldName: "压力孔",
      termType: "pressure_sensor_hole_config",
      position: "post_mesh",
      area: undefined,
      instanceIndex: undefined,
    },
    {
      fieldName: "模唇厚度",
      termType: "lip_thickness_adjustment_range",
      position: undefined,
      area: "lip",
      instanceIndex: 2,
    },
  ],
);

const layerQualifierResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "A层比例",
              value: "15%",
              evidence: { text: "A层比例：15%" },
              confidence: 0.95,
            },
            {
              field_name: "B层原料",
              value: "PS",
              evidence: { text: "B层原料：PS" },
              confidence: 0.95,
            },
            {
              field_name: "C层挤出机型号",
              value: "Φ100",
              evidence: { text: "C层挤出机型号：Φ100" },
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  layerQualifierResult.items[0].fields.map((field) => ({
    fieldName: field.field_name,
    termType: field.dictionary.term_type,
    layer: field.qualifier?.layer,
  })),
  [
    { fieldName: "层比例", termType: "layer_ratio", layer: "A" },
    { fieldName: "挤出机型号", termType: "extruder_model", layer: "B" },
    { fieldName: "挤出机型号", termType: "extruder_model", layer: "C" },
  ],
);
assert.equal(
  layerQualifierResult.extraction_json.items[0].fields[0].qualifier?.layer,
  "A",
);

const layerCompositeResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "A层挤出机型号",
              value: "配Φ100挤出机，产量225 kg/h以下，原料PS",
              raw_text: "A层配Φ100挤出机，产量225 kg/h以下，原料PS",
              evidence: {
                text: "A层配Φ100挤出机，产量225 kg/h以下，原料PS",
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
const layerCompositeFields = layerCompositeResult.items[0].fields.filter(
  (field) => field.dictionary.note !== "复合字段已拆分，原字段仅保留作追溯",
);
assert.deepEqual(
  layerCompositeFields.map((field) => ({
    fieldName: field.field_name,
    rawValue: field.raw_value,
    termType: field.dictionary.term_type,
    layer: field.qualifier?.layer,
  })),
  [
    {
      fieldName: "挤出机型号",
      rawValue: "型号=Φ100；产量=225 kg/h以下；原料=PS",
      termType: "extruder_model",
      layer: "A",
    },
  ],
);
assert.equal(layerCompositeResult.summary.split_resolution_count, 1);

const hostExtruderGroupResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            { field_name: "A主机型号", value: "Φ120单螺杆", confidence: 0.95 },
            { field_name: "A主机PP料产量", value: "850kg/h", confidence: 0.95 },
            { field_name: "A主机原料", value: "PP", confidence: 0.95 },
            { field_name: "适用产量", value: "900kg/h", confidence: 0.95 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
const hostExtruderField = hostExtruderGroupResult.items[0].fields.find(
  (field) => field.dictionary.term_type === "extruder_model",
);
assert.equal(hostExtruderField?.qualifier?.layer, "A");
assert.match(hostExtruderField?.raw_value ?? "", /A主机PP料产量=850kg\/h/);
assert.equal(
  hostExtruderGroupResult.items[0].fields.some(
    (field) => field.dictionary.term_type === "capacity" && /850/.test(field.raw_value),
  ),
  false,
);

const combinedHostExtruderResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [{
        item_index: 1,
        product_type_hint: { value: "flat_die", confidence: 0.9 },
        raw_fields: [{
          field_name: "总挤出量",
          value: "总挤出量900KG/每小时（A主机PP料产量850kg/h,B主机PP料产量80KG/h，C主机EVOH料产量50KG/h，D主机ADH粘胶产量50KG/h）",
          confidence: 0.95,
        }],
      }],
    },
    warnings: [],
  },
});
const combinedHostFields = combinedHostExtruderResult.items[0].fields.filter(
  (field) => field.dictionary.term_type === "extruder_model",
);
assert.deepEqual(
  combinedHostFields.map((field) => field.qualifier?.layer),
  ["A", "B", "C", "D"],
);
assert.deepEqual(
  combinedHostFields.map((field) => field.raw_value),
  [
    "A主机PP料产量=850kg/h",
    "B主机PP料产量=80KG/h",
    "C主机EVOH料产量=50KG/h",
    "D主机ADH粘胶产量=50KG/h",
  ],
);

const consolidatedHeatingResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            { field_name: "两侧板加热", value: "有", confidence: 0.95 },
            { field_name: "模唇加热配置", value: "没有", confidence: 0.95 },
            { field_name: "模唇加热方式", value: "油加温", confidence: 0.95 },
            { field_name: "侧板材质", value: "铝", confidence: 0.95 },
            { field_name: "侧板接插件", value: "有", confidence: 0.95 },
            { field_name: "下模唇开档", value: "1.2mm", confidence: 0.95 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  consolidatedHeatingResult.items[0].fields.map((field) => ({
    termType: field.dictionary.term_type,
    value: field.raw_value,
    area: field.qualifier?.area,
    position: field.qualifier?.position,
  })),
  [
    { termType: "heating_config", value: "有", area: "side_plate", position: undefined },
    { termType: "heating_config", value: "没有", area: "lip", position: undefined },
    { termType: "heating_method", value: "油加温", area: "lip", position: undefined },
    { termType: "heating_config", value: "有", area: "lip", position: undefined },
    { termType: "product_material", value: "铝", area: "side_plate", position: undefined },
    { termType: "connector_config", value: "有", area: "side_plate", position: undefined },
    { termType: "lip_gap", value: "1.2mm", area: "lip", position: "lower_die" },
  ],
);

const validatedBaseFieldQualifierResult = validateLlmExtractionResult({
  extraction: {
    document_info: {},
    items: [
      {
        item_index: 1,
        product_type_hint: { value: "flat_die", confidence: 0.9 },
        raw_fields: [
          {
            field_name: "是否有阻流棒",
            value: "有",
            raw_text: "上模是否有阻流棒：有",
            evidence: { text: "上模是否有阻流棒：有" },
            confidence: 0.95,
            qualifier: {
              position: "upper_die",
              sourceText: "上模",
            },
          },
        ],
      },
    ],
  },
  warnings: [],
});
const baseFieldQualifierResult = await normalizationRulesService.normalizeExtraction({
  llmResult: validatedBaseFieldQualifierResult,
});
assert.equal(baseFieldQualifierResult.items[0].fields[0].field_name, "是否有阻流棒");
assert.equal(
  baseFieldQualifierResult.items[0].fields[0].dictionary.term_type,
  "choker_bar_config",
);
assert.equal(baseFieldQualifierResult.items[0].fields[0].qualifier?.position, "upper_die");
assert.equal(
  baseFieldQualifierResult.extraction_json.items[0].fields[0].qualifier?.sourceText,
  "上模",
);

const bothMoldQualifierResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "上下模是否有阻流棒",
              value: "有",
              evidence: { text: "上下模是否有阻流棒：有" },
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  bothMoldQualifierResult.items[0].fields.map((field) => field.qualifier?.position),
  ["upper_die", "lower_die"],
);

const heatingRodSplitResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "加热棒配置",
              value: "上模，下模",
              confidence: 0.95,
              split_fields: [
                { field_name: "【sel】上模", value: "有", confidence: 0.95 },
                { field_name: "【sel】下模", value: "有", confidence: 0.95 },
              ],
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
const heatingRodFields = heatingRodSplitResult.items[0].fields.filter(
  (field) => field.dictionary.term_type === "heating_rod_config",
);
assert.equal(heatingRodFields.length, 2);
assert.deepEqual(
  heatingRodFields.map((field) => field.qualifier?.position).sort(),
  ["lower_die", "upper_die"],
);

const voltageResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "heating_voltage",
              value: "380 V / 50 Hz / 三相",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  voltageResult.items[0].fields.map((field) => ({
    termType: field.dictionary.term_type,
    rawValue: field.raw_value,
  })),
  [
    { termType: "heating_voltage", rawValue: "380V" },
    { termType: "heating_frequency", rawValue: "50Hz" },
    { termType: "heating_phase", rawValue: "三相" },
  ],
);

const pumpVoltageResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "pump_heating_voltage",
              value: "220 V / 50 Hz",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  pumpVoltageResult.items[0].fields.map((field) => ({
    fieldName: field.field_name,
    termType: field.dictionary.term_type,
    rawValue: field.raw_value,
  })),
  [
    { fieldName: "加热电压", termType: "heating_voltage", rawValue: "220V" },
    { fieldName: "heating_frequency", termType: "heating_frequency", rawValue: "50Hz" },
  ],
);

const standaloneVoltagePartResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            { field_name: "频率", value: "50Hz", confidence: 0.95 },
            { field_name: "相数", value: "三相", confidence: 0.95 },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  standaloneVoltagePartResult.items[0].fields.map((field) => ({
    termType: field.dictionary.term_type,
    rawValue: field.raw_value,
    normalizedValue: field.dictionary.normalized_value,
  })),
  [
    { termType: "heating_frequency", rawValue: "50Hz", normalizedValue: "50Hz" },
    { termType: "heating_phase", rawValue: "三相", normalizedValue: "三相" },
  ],
);

const voltageAndHeatingPowerResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "电压及加热功率",
              value: "220 V / 50 Hz / 单   相 功率 (10 KW)",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  voltageAndHeatingPowerResult.items[0].fields
    .filter((field) => !field.dictionary.note)
    .map((field) => ({
      termType: field.dictionary.term_type,
      rawValue: field.raw_value,
    })),
  [
    { termType: "heating_voltage", rawValue: "220V" },
    { termType: "heating_frequency", rawValue: "50Hz" },
    { termType: "heating_phase", rawValue: "单相" },
    { termType: "heating_power", rawValue: "10KW" },
  ],
);

const voltageAndBlankPowerResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "电压及加热功率",
              value: "220 V / 50 Hz / 单   相 功率 ( KW )",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  voltageAndBlankPowerResult.items[0].fields
    .filter((field) => !field.dictionary.note)
    .map((field) => field.dictionary.term_type),
  ["heating_voltage", "heating_frequency", "heating_phase"],
);

const voltageAndEmptyTemplateResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "feedblock", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "电压及加热功率",
              value: "功率 (            KW )",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(voltageAndEmptyTemplateResult.items[0].fields.length, 0);
assert.equal(voltageAndEmptyTemplateResult.summary.term_type_candidate_count, 0);

const roughnessRangeResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "镶块粗糙度",
              value: "A级（0.02-0.03μm）",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(roughnessRangeResult.items[0].fields[0].dictionary.roughness, {
  raw: "A级（0.02-0.03μm）",
  grade: "A",
  unit: "μm",
  rangeMin: 0.02,
  rangeMax: 0.03,
});

const roughnessBoundResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "镶块粗糙度",
              value: "小于0.04um",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(roughnessBoundResult.items[0].fields[0].dictionary.roughness, {
  raw: "小于0.04um",
  bound: "lt",
  value: 0.04,
  unit: "um",
});

const channelRoughnessResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "melt_pipe", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "流道抛光精度",
              value: "Ra0.15",
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
  channelRoughnessResult.items[0].fields[0].dictionary.term_type,
  "surface_roughness",
);
assert.equal(channelRoughnessResult.items[0].fields[0].qualifier?.area, "channel");
assert.deepEqual(channelRoughnessResult.items[0].fields[0].dictionary.roughness, {
  raw: "Ra0.15",
  value: 0.15,
});

const thermocouplePressureHoleResult =
  await normalizationRulesService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "melt_pipe", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "测温孔及网后压力孔",
                value: "按双方图纸",
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.deepEqual(
  thermocouplePressureHoleResult.items[0].fields
    .filter((field) => !field.dictionary.note)
    .map((field) => ({
      fieldName: field.field_name,
      termType: field.dictionary.term_type,
      rawValue: field.raw_value,
    })),
  [
    {
      fieldName: "热电偶孔规格",
      termType: "thermocouple_hole_specification",
      rawValue: "按双方图纸",
    },
    {
      fieldName: "压力传感器孔配置",
      termType: "pressure_sensor_hole_config",
      rawValue: "按双方图纸",
    },
  ],
);
assert.equal(
  thermocouplePressureHoleResult.items[0].fields.find(
    (field) => field.dictionary.term_type === "pressure_sensor_hole_config",
  )?.qualifier?.position,
  "post_mesh",
);

assert.equal(
  normalizationRulesService
    ? voltageResult.summary.value_candidate_count
    : 1,
  0,
);

const customerNoteReparseResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "客户特别备注",
              value: "上模加热棒角度45°",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(customerNoteReparseResult.items[0].notes_raw?.[0].raw_value, "上模加热棒角度45°");
assert.equal(
  (customerNoteReparseResult.extraction_json.document_info as any).customer_notes[0].raw_value,
  "上模加热棒角度45°",
);
assert.equal(customerNoteReparseResult.items[0].fields.length, 1);
assert.equal(customerNoteReparseResult.items[0].fields[0].field_name, "加热棒角度");
assert.equal(customerNoteReparseResult.items[0].fields[0].dictionary.term_type, "heating_rod_angle");
assert.equal(customerNoteReparseResult.items[0].fields[0].qualifier?.position, "upper_die");
assert.equal(customerNoteReparseResult.items[0].fields[0].source, "customer_note_reparse");
assert.equal(customerNoteReparseResult.items[0].fields[0].requires_review, true);
assert.equal(customerNoteReparseResult.items[0].fields[0].trust_level, "medium");

const customerNoteTextOnlyResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "订单备注",
              value: "请尽快交货",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.equal(customerNoteTextOnlyResult.items[0].notes_raw?.[0].raw_value, "请尽快交货");
assert.deepEqual(customerNoteTextOnlyResult.items[0].fields, []);

const splitCustomerNoteResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "联接尺寸图纸提供情况",
              value: "按原图纸 备注：请尽快交货",
              confidence: 0.95,
              split_fields: [
                {
                  field_name: "联接尺寸图纸提供情况",
                  value: "按原图纸",
                  confidence: 0.95,
                },
                {
                  field_name: "备注",
                  value: "请尽快交货",
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
assert.equal(splitCustomerNoteResult.items[0].notes_raw?.[0].raw_value, "请尽快交货");
assert.equal(
  splitCustomerNoteResult.items[0].fields.some(
    (field) => field.field_name === "备注",
  ),
  false,
);

const customerNoteConflictResult = await normalizationRulesService.normalizeExtraction({
  llmResult: {
    extraction: {
      document_info: {},
      items: [
        {
          item_index: 1,
          product_type_hint: { value: "flat_die", confidence: 0.9 },
          raw_fields: [
            {
              field_name: "上模加热棒角度",
              value: "30°",
              confidence: 0.95,
            },
            {
              field_name: "客户特别注明1",
              value: "上模加热棒角度45°",
              confidence: 0.95,
            },
          ],
        },
      ],
    },
    warnings: [],
  },
});
assert.deepEqual(
  customerNoteConflictResult.items[0].fields.map((field) => field.raw_value),
  ["30°"],
);
assert.equal(
  customerNoteConflictResult.warnings.some(
    (warning) => warning.type === "customer_note_config_conflict",
  ),
  true,
);

const candidateSuppressionService = new ExtractionNormalizationService(
  {} as any,
  {
    async getProductTypeOptions() {
      return [];
    },
    async flushAliasUsageStats() {},
    async normalizeField(params: any) {
      if (params.fieldName === "模唇加热方式") {
        return {
          matched: false,
          fieldMatched: true,
          rawFieldName: params.fieldName,
          normalizedFieldName: params.fieldName,
          rawValue: params.rawValue,
          normalizedValue: params.rawValue,
          termType: "heating_method",
          valueKind: "enum",
          valueCandidate: {
            id: "901",
            termType: "heating_method",
            rawValue: params.rawValue,
            sourceProductType: params.itemProductTypeHint,
            itemIndex: params.itemIndex,
            status: "pending",
          },
          warnings: [{ type: "value_no_match", message: "字段值未命中字典" }],
        };
      }
      return {
        matched: false,
        fieldMatched: false,
        rawFieldName: params.fieldName,
        normalizedFieldName: params.fieldName,
        rawValue: params.rawValue,
        normalizedValue: params.rawValue,
        termTypeCandidate: {
          id: "902",
          rawFieldName: params.fieldName,
          sourceProductType: params.itemProductTypeHint,
          itemIndex: params.itemIndex,
          status: "pending",
        },
        warnings: [{ type: "term_type_no_match", message: "字段名未命中字典" }],
      };
    },
  } as any,
);

const qualifierCandidateSuppressionResult =
  await candidateSuppressionService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "flat_die", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "模唇加热方式",
                value: "油加温",
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(qualifierCandidateSuppressionResult.summary.value_candidate_count, 0);
assert.equal(qualifierCandidateSuppressionResult.items[0].fields[0].candidate, undefined);
assert.equal(
  qualifierCandidateSuppressionResult.items[0].fields[0].qualifier?.area,
  "lip",
);
assert.equal(
  qualifierCandidateSuppressionResult.items[0].fields[0].warnings.some(
    (warning) => warning.type === "candidate_suppressed_by_normalization_rule",
  ),
  true,
);

const indexedCandidateSuppressionResult =
  await candidateSuppressionService.normalizeExtraction({
    llmResult: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            product_type_hint: { value: "flat_die", confidence: 0.9 },
            raw_fields: [
              {
                field_name: "未知配置1",
                value: "有",
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
  });
assert.equal(indexedCandidateSuppressionResult.summary.term_type_candidate_count, 0);
assert.equal(indexedCandidateSuppressionResult.items[0].fields[0].candidate, undefined);

assert.equal(
  classifyEnumResidual("deckle_type", "外堵式（单边挡300mm）").action,
  "suppress",
);
assert.equal(
  classifyEnumResidual("connector_type", "换网器用连接器").action,
  "suppress",
);
assert.equal(
  classifyEnumResidual("flow_channel_type", "其他（PVB专用流道）").action,
  "suppress",
);

console.log("productConfigAgent extraction normalization tests passed");
