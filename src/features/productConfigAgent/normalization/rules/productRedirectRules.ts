import type { LlmExtractionItem, LlmRawField } from "../../extraction/types.js";

export type ProductTypeRoute = {
  item: LlmExtractionItem;
  route: { itemProductTypeHint: string };
};

export function getRawFieldProductTypeRedirect(params: {
  rawField: LlmRawField;
  itemIndex: number;
  itemProductTypeHint: string;
  flatDieRoute?: ProductTypeRoute;
  hydraulicStationRoute?: ProductTypeRoute;
}): ProductTypeRoute | null {
  const fieldName = String(params.rawField.field_name ?? "");
  const normalizedFieldName = fieldName.replace(/\s+/g, "");
  const isDieField =
    normalizedFieldName.includes("\u6a21\u5934\u6709\u6548\u5bbd\u5ea6") ||
    normalizedFieldName.includes(
      "\u6a21\u5934\u51fa\u6599\u6709\u6548\u5bbd\u5ea6",
    ) ||
    normalizedFieldName.includes(
      "\u6a21\u5934\u5bbd\u5ea6\u8c03\u8282\u65b9\u5f0f",
    ) ||
    normalizedFieldName.includes("\u6a21\u5507") ||
    normalizedFieldName.includes("\u53e3\u6a21\u5bbd\u5ea6") ||
    normalizedFieldName.includes("\u53e3\u6a21\u6709\u6548\u5bbd\u5ea6");
  if (
    isDieField &&
    params.itemProductTypeHint !== "flat_die" &&
    params.flatDieRoute &&
    params.flatDieRoute.item.item_index !== params.itemIndex
  ) {
    return params.flatDieRoute;
  }

  const isHydraulicStationField =
    normalizedFieldName.includes("\u6db2\u538b\u7ad9") ||
    normalizedFieldName.includes("\u6cb9\u7bb1\u5bb9\u91cf") ||
    normalizedFieldName.includes("\u6db2\u538b\u538b\u529b") ||
    normalizedFieldName.includes("\u63a7\u5236\u65b9\u5f0f") ||
    normalizedFieldName.includes("\u7535\u673a\u529f\u7387") ||
    normalizedFieldName.includes("\u7535\u673a\u7535\u538b");
  if (
    isHydraulicStationField &&
    params.itemProductTypeHint !== "hydraulic_station" &&
    params.hydraulicStationRoute &&
    params.hydraulicStationRoute.item.item_index !== params.itemIndex
  ) {
    return params.hydraulicStationRoute;
  }

  return null;
}
