import type {
  NormalizedFieldResult,
  TermTypeMatchResult,
  ValueMatchResult,
} from "./dictionary.types.js";

export function normalizeText(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input)
    .trim()
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[■□☑✔✓]/g, "")
    .replace(/\s+/g, "")
    .replace(/[()\（\）[\]【】\-_：:;；,，、"“”']/g, "");
}

export function valueAliasKey(termType: string, normalizedAlias: string): string {
  return `${termType}:${normalizedAlias}`;
}

export function termTypeSpecificityScore(
  termType: string,
  rawValue: string,
): number {
  if (rawValue.includes("下模") && termType === "lower_lip_adjustment_method") {
    return 2;
  }

  if (rawValue.includes("上模") && termType === "upper_lip_adjustment_method") {
    return 2;
  }

  if (
    termType === "upper_lip_adjustment_method" ||
    termType === "lower_lip_adjustment_method"
  ) {
    return 1;
  }

  return 0;
}

export function buildMatchedFieldResult(
  params: {
    fieldName: string;
    rawValue: string;
    itemIndex?: number;
    itemProductTypeHint?: string;
  },
  termTypeMatch: TermTypeMatchResult,
  valueMatch: ValueMatchResult,
): NormalizedFieldResult {
  const warnings: NormalizedFieldResult["warnings"] = [];

  if (
    valueMatch.riskLevel === "ambiguous" ||
    valueMatch.riskLevel === "pricing_sensitive"
  ) {
    warnings.push({
      type: "dictionary_risk",
      message: "该字典命中存在风险，请人工确认",
      rawValue: params.rawValue,
      termType: valueMatch.termType,
    });
  }

  return {
    matched: true,
    fieldMatched: true,
    rawFieldName: params.fieldName,
    normalizedFieldName: termTypeMatch.normalizedFieldName,
    rawValue: params.rawValue,
    normalizedValue: valueMatch.normalizedValue,
    termType: valueMatch.termType,
    candidateTermTypes:
      termTypeMatch.termTypes.length > 1 ? termTypeMatch.termTypes : undefined,
    canonicalValue: valueMatch.canonicalValue,
    displayName: valueMatch.displayName,
    confidence: valueMatch.confidence,
    riskLevel: valueMatch.riskLevel,
    note: valueMatch.note,
    valueKind: valueMatch.valueKind,
    matchMethod: valueMatch.matchMethod,
    itemIndex: params.itemIndex,
    itemProductTypeHint: params.itemProductTypeHint,
    warnings,
  };
}
