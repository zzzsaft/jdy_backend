import type { LlmExtractionResult } from "../extraction/types.js";

export type DictionaryExtractionManualSample = {
  name: string;
  input: LlmExtractionResult;
  expectations: string[];
};

const evidence = { source: "manual_sample" };

export const dictionaryExtractionManualSamples: DictionaryExtractionManualSample[] = [
  {
    name: "single_flat_die",
    input: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            item_name: {
              value: "1900mmCPE流延膜手动模头",
              evidence,
              confidence: 0.95,
            },
            item_quantity: { value: "1套", evidence, confidence: 0.95 },
            product_type_hint: {
              value: "flat_die",
              raw_value: "1900mmCPE流延膜手动模头",
              display_name: "平模头",
              evidence,
              confidence: 0.95,
            },
            raw_fields: [
              {
                field_name: "模唇调节方式",
                value: "手动",
                raw_text: "模唇调节方式：手动",
                evidence,
                confidence: 0.95,
              },
              {
                field_name: "堵边方式",
                value: "内堵边",
                raw_text: "堵边方式：内堵边",
                evidence,
                confidence: 0.95,
              },
              {
                field_name: "流道形式",
                value: "衣架式",
                raw_text: "流道形式：衣架式",
                evidence,
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
    expectations: [
      "输出 1 个 item",
      "itemProductTypeHint = flat_die",
      "模唇、堵边、流道字段只在 flat_die/common applicableProductTypes 中高置信匹配",
    ],
  },
  {
    name: "multi_product_flat_die_filter_metering_pump",
    input: {
      extraction: {
        document_info: {},
        items: [
          {
            item_index: 1,
            item_name: {
              value: "1900mmCPE流延膜手动模头",
              evidence,
              confidence: 0.95,
            },
            item_quantity: { value: "1套", evidence, confidence: 0.95 },
            product_type_hint: {
              value: "flat_die",
              raw_value: "1900mmCPE流延膜手动模头",
              display_name: "平模头",
              evidence,
              confidence: 0.95,
            },
            raw_fields: [
              {
                field_name: "模体材质",
                value: "B 2311A钢",
                evidence,
                confidence: 0.95,
              },
            ],
          },
          {
            item_index: 2,
            item_name: {
              value: "JC-SC-250 双柱液压换网器",
              evidence,
              confidence: 0.95,
            },
            item_quantity: { value: "1套", evidence, confidence: 0.95 },
            product_type_hint: {
              value: "filter",
              raw_value: "JC-SC-250 双柱液压换网器",
              display_name: "过滤器 / 换网器",
              evidence,
              confidence: 0.95,
            },
            raw_fields: [
              {
                field_name: "换网器结构",
                value: "双柱液压",
                evidence,
                confidence: 0.95,
              },
            ],
          },
          {
            item_index: 3,
            item_name: {
              value: "10ccm 熔体计量泵",
              evidence,
              confidence: 0.95,
            },
            item_quantity: { value: "2台", evidence, confidence: 0.95 },
            product_type_hint: {
              value: "metering_pump",
              raw_value: "10ccm 熔体计量泵",
              display_name: "计量泵",
              evidence,
              confidence: 0.95,
            },
            raw_fields: [
              {
                field_name: "排量",
                value: "10ccm",
                evidence,
                confidence: 0.95,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
    expectations: [
      "输出 3 个 items，route 分别为 flat_die/filter/metering_pump",
      "换网器字段不进入 flat_die item",
      "排量字段优先匹配 metering_pump applicableProductTypes",
    ],
  },
  {
    name: "cross_product_candidate",
    input: {
      extraction: {
        items: [
          {
            item_index: 1,
            item_name: { value: "平模头", evidence, confidence: 0.9 },
            product_type_hint: {
              value: "flat_die",
              raw_value: "平模头",
              evidence,
              confidence: 0.9,
            },
            raw_fields: [
              {
                field_name: "排量",
                value: "10ccm",
                evidence,
                confidence: 0.9,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
    expectations: [
      "如果排量只适用于 metering_pump，不应在 flat_die item 中高置信确认",
      "应生成 term_type_cross_product_fallback candidate 或 warning",
    ],
  },
  {
    name: "unknown_product_type_hint",
    input: {
      extraction: {
        items: [
          {
            item_index: 1,
            item_name: { value: "未知配套件", evidence, confidence: 0.7 },
            item_type_hint: {
              value: "custom_auxiliary",
              raw_value: "未知配套件",
              evidence,
              confidence: 0.6,
            },
            raw_fields: [
              {
                field_name: "备注",
                value: "按图制作",
                evidence,
                confidence: 0.9,
              },
            ],
          },
        ],
      },
      warnings: [],
    },
    expectations: [
      "itemProductTypeHint = unknown",
      "保留 raw_value 并生成 unknown_product_type_hint warning",
      "字段匹配按历史兼容逻辑允许，但前端显示 unknown badge",
    ],
  },
];
