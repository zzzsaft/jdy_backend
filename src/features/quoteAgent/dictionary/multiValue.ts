import { normalizeText } from "./dictionary.utils.js";
import type {
  CachedTermType,
  CachedValueAlias,
  MultiValueToken,
  NormalizedEnumValue,
  NormalizedFieldResult,
} from "./dictionary.types.js";

/**
 * Delimiters used for splitting multi-enum values.
 * Ordered by priority: space can be overridden per termType.
 */
const DELIMITER_RE = /[、，,;；\/＋+\n]/;

/**
 * Extract tokens from a multi-enum field value.
 *
 * Rules:
 * 1. Prefer split_fields if available.
 * 2. Otherwise split by delimiters.
 * 3. For known material/process/application list fields, allow space split.
 * 4. Avoid splitting model numbers / specs / ranges.
 */
export function extractMultiValueTokens(
  rawValue: string,
  splitRawValues?: string[],
  termType?: string,
): MultiValueToken[] {
  // Use split field values if provided
  if (splitRawValues && splitRawValues.length > 0) {
    return splitRawValues.map((v, i) => ({
      value: normalizeTextForToken(v),
      rawText: v.trim(),
      source: "split_field" as const,
      confidence: 1.0,
    }));
  }

  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  // Check if we should also split by space for specific term types
  const allowSpaceSplit =
    termType === "plastic_material" ||
    termType === "applicable_plastic_material" ||
    termType === "applicable_process_type" ||
    termType === "application_type" ||
    termType === "surface_treatment_requirement" ||
    termType === "accessory_list";

  // Split by delimiters first
  const delimiterParts = trimmed
    .split(DELIMITER_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  // Then for each part, if space-split allowed, split further
  const allParts: Array<{ value: string; rawText: string }> = [];
  for (const part of delimiterParts) {
    const shouldSplitSpace =
      part.includes(" ") &&
      (allowSpaceSplit || /^[A-Za-z0-9_\-.]+(?:\s+[A-Za-z0-9_\-.]+)+$/.test(part));
    if (shouldSplitSpace) {
      const spaceParts = part
        .split(/\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const sp of spaceParts) {
        allParts.push({ value: sp, rawText: sp });
      }
    } else {
      allParts.push({ value: part, rawText: part });
    }
  }

  if (allParts.length === 0) {
    return [
      {
        value: normalizeTextForToken(trimmed),
        rawText: trimmed,
        source: "raw_field",
        confidence: 1.0,
      },
    ];
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const tokens: MultiValueToken[] = [];
  for (const part of allParts) {
    const normalized = part.value;
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tokens.push({
      value: normalized,
      rawText: part.rawText,
      source: "delimiter",
      confidence: 1.0,
    });
  }

  return tokens;
}

/**
 * Normalize a single enum value (existing behavior).
 */
export function normalizeSingleEnumValue(
  rawValue: string,
  termType: CachedTermType,
  context: { aliasMap: Map<string, CachedValueAlias> },
): {
  canonicalValue?: string;
  displayName?: string;
  termId?: string;
  aliasId?: string;
  confidence?: number;
  matched: boolean;
} {
  const normalizedValue = normalizeText(rawValue);
  if (!normalizedValue) {
    return { matched: false };
  }

  const key = valueAliasKeyForLookup(termType.termType, normalizedValue);
  const alias = context.aliasMap.get(key);

  if (alias) {
    return {
      matched: true,
      canonicalValue: alias.canonicalValue,
      displayName: alias.displayName ?? alias.canonicalValue,
      termId: alias.termId,
      aliasId: alias.aliasId,
      confidence: alias.confidence,
    };
  }

  return { matched: false };
}

/**
 * Normalize a multi-enum field (valueKind = "enums").
 * Splits rawValue into tokens, resolves each token through dictionary_aliases.
 */
export function normalizeMultiEnumValues(
  rawValue: string,
  termType: CachedTermType,
  context: {
    aliasMap: Map<string, CachedValueAlias>;
    splitRawValues?: string[];
  },
): {
  values: NormalizedEnumValue[];
  unmatchedTokens: string[];
  matched: boolean;
} {
  const tokens = extractMultiValueTokens(
    rawValue,
    context.splitRawValues,
    termType.termType,
  );

  const values: NormalizedEnumValue[] = [];
  const unmatchedTokens: string[] = [];
  const seenCanonical = new Set<string>();

  for (const token of tokens) {
    const key = valueAliasKeyForLookup(termType.termType, token.value);
    const alias = context.aliasMap.get(key);

    if (alias) {
      if (seenCanonical.has(alias.canonicalValue)) continue;
      seenCanonical.add(alias.canonicalValue);
      values.push({
        canonicalValue: alias.canonicalValue,
        displayName: alias.displayName ?? token.rawText,
        rawValue: token.rawText,
        confidence: alias.confidence,
        termId: alias.termId,
        aliasId: alias.aliasId,
      });
    } else {
      unmatchedTokens.push(token.rawText);
    }
  }

  return {
    values,
    unmatchedTokens,
    matched: values.length > 0,
  };
}

/**
 * Build a NormalizedFieldResult for an enums field.
 * Keeps first canonicalValue as legacy compatibility.
 */
export function buildEnumsFieldResult(params: {
  rawFieldName: string;
  rawValue: string;
  termType: CachedTermType;
  values: NormalizedEnumValue[];
  unmatchedTokens: string[];
  itemIndex?: number;
  itemProductTypeHint?: string;
  normalizedFieldName: string;
  valueCandidate?: NormalizedFieldResult["valueCandidate"];
  warnings: NormalizedFieldResult["warnings"];
}): NormalizedFieldResult {
  const result: NormalizedFieldResult = {
    matched: params.values.length > 0,
    fieldMatched: true,
    rawFieldName: params.rawFieldName,
    normalizedFieldName: params.normalizedFieldName,
    rawValue: params.rawValue,
    normalizedValue: normalizeText(params.rawValue),
    termType: params.termType.termType,
    valueKind: "enums",
    values: params.values,
    // Legacy single-value support
    canonicalValue: params.values[0]?.canonicalValue ?? null,
    displayName: params.values[0]?.displayName ?? null,
    confidence: params.values[0]?.confidence,
    matchMethod: params.values.length > 0 ? "alias_exact" : "none",
    itemIndex: params.itemIndex,
    itemProductTypeHint: params.itemProductTypeHint,
    valueCandidate: params.valueCandidate,
    warnings: params.warnings,
  };

  if (params.unmatchedTokens.length > 0) {
    result.warnings.push({
      type: "enums_unmatched_token",
      message: `以下值未匹配字典：${params.unmatchedTokens.join("、")}，是否创建为新标准值？`,
      rawValue: params.rawValue,
      termType: params.termType.termType,
    });
  }

  return result;
}

function normalizeTextForToken(input: string): string {
  return normalizeText(input);
}

function valueAliasKeyForLookup(
  termType: string,
  normalizedAlias: string,
): string {
  return `${termType}:${normalizedAlias}`;
}
