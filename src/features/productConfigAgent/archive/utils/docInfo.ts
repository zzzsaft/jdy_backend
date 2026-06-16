import type { JsonObject } from "../types.js";
import { normalizeKey, normalizeOptionalString } from "./string.js";

const DOC_INFO_KEY_ALIASES: Record<string, string[]> = {
  product_number: [
    "product_number",
    "die_number",
    "parts_number",
    "product_no",
    "product_code",
    "accessory_number",
    "产品编号",
    "制品编号",
    "模头编号",
    "模具编号",
    "喷丝板编号",
    "喷丝组件编号",
    "配件编号",
  ],
  contract_number: ["contract_number", "contract_no", "合同编号", "合同号"],
  order_number: ["order_number", "order_no", "订单编号", "订单号", "销售订单号"],
  customer_id: ["customer_id", "customer_no", "客户id", "客户ID", "客户编号"],
  customer_name: ["customer_name", "customer", "客户", "客户名称", "客户名"],
  country: [
    "country",
    "国家",
    "出口国家",
    "出口国别",
    "出口使用国家",
    "目的国家",
    "目的地国家",
  ],
  order_date: ["order_date", "下单日期", "订单日期"],
  delivery_date: ["delivery_date", "交货日期", "交期"],
  completion_date: ["completion_date", "完工日期"],
  shipment_date: ["shipment_date", "实际发货日期", "发货日期"],
  shipping_method: [
    "shipping_method",
    "shipment_method",
    "delivery_method",
    "发货方式",
    "运输方式",
    "物流方式",
    "配送方式",
  ],
  usage_market: [
    "usage_market",
    "\u51fa\u53e3\u4fe1\u606f",
    "\u4f7f\u7528\u5730\u70b9",
    "\u56fd\u5185\u4f7f\u7528\u6216\u51fa\u53e3\u4f7f\u7528",
    "使用市场",
    "使用地",
    "使用地区",
    "使用区域",
    "国内使用",
    "出口使用",
    "国内使用/出口使用",
    "国内/出口使用",
    "出口/国内使用",
    "国内或出口使用",
  ],
  business_owner: ["business_owner", "业务接单人", "业务员", "接单人"],
  contract_creator: ["contract_creator", "合同制作人", "制单人"],
};

const NORMALIZED_DOC_INFO_KEY = new Map<string, string>();
for (const [canonicalKey, aliases] of Object.entries(DOC_INFO_KEY_ALIASES)) {
  for (const alias of aliases) {
    NORMALIZED_DOC_INFO_KEY.set(normalizeKey(alias), canonicalKey);
  }
}

export function normalizeDocInfoKey(rawKey: string): string | null {
  return NORMALIZED_DOC_INFO_KEY.get(normalizeKey(rawKey)) ?? null;
}

export function isDocInfoFieldName(rawKey: string): boolean {
  return normalizeDocInfoKey(rawKey) !== null;
}

export function getFieldValue(field: unknown): string | null {
  if (field && typeof field === "object" && !Array.isArray(field)) {
    return normalizeOptionalString((field as JsonObject).value);
  }
  return normalizeOptionalString(field);
}

export function getFieldConfidence(field: unknown): number | null {
  if (!field || typeof field !== "object" || Array.isArray(field)) {
    return null;
  }
  const confidence = Number((field as JsonObject).confidence);
  return Number.isFinite(confidence) ? confidence : null;
}

export function parseDateString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{4})[./\-年](\d{1,2})[./\-月](\d{1,2})/);
  if (!match) return null;
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${match[1]}-${month}-${day}`;
}

export function normalizeDocInfo(rawDocInfo: unknown): JsonObject {
  const result: JsonObject = {};
  if (!rawDocInfo || typeof rawDocInfo !== "object" || Array.isArray(rawDocInfo)) {
    return result;
  }

  for (const [rawKey, rawField] of Object.entries(rawDocInfo as JsonObject)) {
    const canonicalKey = normalizeDocInfoKey(rawKey) ?? rawKey;
    const nextValue = getFieldValue(rawField);
    const nextConfidence = getFieldConfidence(rawField);
    const existing = result[canonicalKey];
    const existingConfidence = getFieldConfidence(existing);
    if (
      existing &&
      getFieldValue(existing) &&
      (nextConfidence ?? 0) < (existingConfidence ?? 0)
    ) {
      continue;
    }
    result[canonicalKey] = {
      ...(rawField && typeof rawField === "object" && !Array.isArray(rawField)
        ? (rawField as JsonObject)
        : { value: rawField }),
      value: nextValue ?? "",
      rawKey,
      canonicalKey,
    };
  }

  return result;
}

export function extractDocInfoValue(docInfo: JsonObject, key: string): string | null {
  return getFieldValue(docInfo[key]);
}

export function summarizeDocInfo(docInfo: JsonObject) {
  return {
    productNumber: extractDocInfoValue(docInfo, "product_number"),
    contractNumber: extractDocInfoValue(docInfo, "contract_number"),
    orderNumber: extractDocInfoValue(docInfo, "order_number"),
    customerId: extractDocInfoValue(docInfo, "customer_id"),
    customerName: extractDocInfoValue(docInfo, "customer_name"),
    country: extractDocInfoValue(docInfo, "country"),
    orderDate: parseDateString(extractDocInfoValue(docInfo, "order_date")),
    deliveryDate: parseDateString(extractDocInfoValue(docInfo, "delivery_date")),
  };
}
