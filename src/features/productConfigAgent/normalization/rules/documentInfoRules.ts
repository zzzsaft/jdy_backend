import type { LlmRawField } from "../../extraction/types.js";
import {
  getFieldConfidence,
  getFieldValue,
  normalizeDocInfoKey,
} from "../../archive/utils/docInfo.js";

export function moveRawFieldToDocumentInfo(
  documentInfo: Record<string, unknown>,
  rawField: LlmRawField,
): boolean {
  const canonicalKey = normalizeDocInfoKey(rawField.field_name);
  if (!canonicalKey) {
    return false;
  }

  const exportInfo = extractExportDocumentInfo(rawField.value);
  if (canonicalKey === "usage_market" && exportInfo) {
    upsertDocumentInfoField(documentInfo, "usage_market", {
      value: exportInfo.usageMarket,
      evidence: rawField.evidence,
      confidence: rawField.confidence,
      rawKey: rawField.field_name,
    });
    if (exportInfo.country) {
      upsertDocumentInfoField(documentInfo, "country", {
        value: exportInfo.country,
        evidence: rawField.evidence,
        confidence: rawField.confidence,
        rawKey: rawField.field_name,
      });
    }
    return true;
  }

  upsertDocumentInfoField(documentInfo, canonicalKey, {
    value: rawField.value,
    evidence: rawField.evidence,
    confidence: rawField.confidence,
    rawKey: rawField.field_name,
  });
  return true;
}

function upsertDocumentInfoField(
  documentInfo: Record<string, unknown>,
  canonicalKey: string,
  field: {
    value: string;
    evidence?: unknown;
    confidence: number;
    rawKey: string;
  },
): void {
  if (!field.value) return;

  const existing = documentInfo[canonicalKey];
  const existingValue = getFieldValue(existing);
  const existingConfidence = getFieldConfidence(existing);
  if (existingValue && field.confidence < (existingConfidence ?? 0)) {
    return;
  }

  documentInfo[canonicalKey] = {
    value: field.value,
    evidence: field.evidence,
    confidence: field.confidence,
    rawKey: field.rawKey,
    canonicalKey,
  };
}

function extractExportDocumentInfo(value: string): {
  usageMarket: string;
  country?: string;
} | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const hasUsageMarket =
    text.includes("\u51fa\u53e3\u4f7f\u7528") ||
    text.includes("\u56fd\u5185\u4f7f\u7528");
  if (!hasUsageMarket) return null;

  const countryMatch = text.match(
    /(?:\u56fd\u5bb6|\u51fa\u53e3\u56fd\u5bb6|\u51fa\u53e3\u56fd\u522b)\s*[:\uff1a,\uff0c(（]?\s*([^,\uff0c;；)\uff09\s]+)/u,
  );
  const usageMarket = text.includes("\u51fa\u53e3\u4f7f\u7528")
    ? "\u51fa\u53e3\u4f7f\u7528"
    : "\u56fd\u5185\u4f7f\u7528";
  return {
    usageMarket,
    country: countryMatch?.[1]?.trim(),
  };
}
