import type { LlmExtractionItem } from "../extraction/types.js";
import type { DictionaryExtractionWarning } from "./types.js";
import { createWarning } from "./warnings.js";

type ProductTypeOption = {
  canonicalValue: string;
  displayName: string;
};

export function resolveItemProductTypeHint(params: {
  item: LlmExtractionItem;
  productTypeMap: Map<string, ProductTypeOption>;
}): {
  itemProductTypeHint: string;
  rawValue?: string;
  displayName?: string;
  confidence?: number;
  warnings: DictionaryExtractionWarning[];
} {
  const hint = params.item.item_type_hint ?? params.item.product_type_hint;
  const value = String(hint?.value ?? "").trim();
  const rawValue = hint?.raw_value ?? value;
  const matched = value ? params.productTypeMap.get(value) : undefined;

  if (matched) {
    return {
      itemProductTypeHint: matched.canonicalValue,
      rawValue,
      displayName: hint?.display_name ?? matched.displayName,
      confidence: hint?.confidence,
      warnings: [],
    };
  }

  if (!value || value === "unknown") {
    return {
      itemProductTypeHint: "unknown",
      rawValue,
      displayName: hint?.display_name,
      confidence: hint?.confidence,
      warnings: [],
    };
  }

  return {
    itemProductTypeHint: "unknown",
    rawValue,
    displayName: hint?.display_name,
    confidence: hint?.confidence,
    warnings: [
      createWarning({
        type: "unknown_product_type_hint",
        message: "item 产品类型 hint 未命中 product_type 字典，已按 unknown 路由",
        itemIndex: params.item.item_index,
        rawValue,
        evidence: hint?.evidence,
      }),
    ],
  };
}
