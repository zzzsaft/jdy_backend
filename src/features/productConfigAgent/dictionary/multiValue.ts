import { normalizeText } from "./dictionary.utils.js";
import type {
  CachedTermType,
  CachedValueAlias,
  MaterialPrefixSplitResult,
  MultiValueToken,
  NormalizedEnumValue,
  NormalizedFieldResult,
} from "./dictionary.types.js";

/**
 * Delimiters used for splitting multi-enum values.
 * Whitespace is handled separately after punctuation splitting so values such as
 * "POM ABS" become two enum tokens.
 */
const DELIMITER_RE = /[、，,;；\/＋+\n]/;

type MaterialPrefixToken = {
  rawText: string;
  normalized: string;
  suffix?: string;
};

type ParsedMaterialCandidatePart = {
  normalized: string;
  hadCompositionPrefix: boolean;
};

/**
 * Extract tokens from a multi-enum field value.
 *
 * Rules:
 * 1. Prefer split_fields if available.
 * 2. Otherwise split by delimiters.
 * 3. Split each part by whitespace.
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

  // Split by delimiters first
  const delimiterParts = trimmed
    .split(DELIMITER_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  // Then split by whitespace. The termType argument is kept for API stability.
  void termType;
  const allParts: Array<{ value: string; rawText: string }> = [];
  for (const part of delimiterParts) {
    const spaceParts = part
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const sp of spaceParts) {
      const normalizedPart = normalizeTextForToken(sp);
      if (termType === "plastic_material" && isIgnorablePlasticMaterialToken(normalizedPart)) {
        continue;
      }
      allParts.push({ value: normalizedPart, rawText: sp });
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

export function splitPlasticMaterialPrefixTokens(
  rawValue: string,
  aliasMap: Map<string, CachedValueAlias>,
): {
  tokens: MultiValueToken[];
  split?: MaterialPrefixSplitResult;
} | null {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return null;

  const materialAliases = activeMaterialAliasTokens(aliasMap);
  if (materialAliases.length === 0) return null;

  const parts = splitMaterialCandidateParts(trimmed);
  const materialTokens: MaterialPrefixToken[] = [];
  const unmatchedStandaloneTokens: MultiValueToken[] = [];
  const suffixes: string[] = [];

  for (const part of parts) {
    const parsedPart = parseMaterialCandidatePart(part);
    const normalizedPart = parsedPart.normalized;
    if (!normalizedPart) continue;

    const match = materialAliases.find((alias) =>
      normalizedPart.startsWith(alias.normalized),
    );
    if (!match) {
      if (looksLikeStandaloneMaterialToken(normalizedPart)) {
        unmatchedStandaloneTokens.push({
          value: normalizedPart,
          rawText: part.trim(),
          source: "delimiter",
          confidence: 1,
        });
      } else if (/[\u4e00-\u9fff]/u.test(normalizedPart)) {
        const unknownMaterial = parsedPart.hadCompositionPrefix
          ? splitUnknownCompositionMaterial(normalizedPart)
          : looksLikeUnknownCompositionMaterial(normalizedPart)
            ? splitUnknownCompositionMaterial(normalizedPart)
            : looksLikeUnknownMaterialStem(normalizedPart)
              ? { materialRawValue: normalizedPart }
              : null;
        if (unknownMaterial) {
          unmatchedStandaloneTokens.push({
            value: normalizeTextForToken(unknownMaterial.materialRawValue),
            rawText: unknownMaterial.materialRawValue,
            source: "delimiter",
            confidence: 0.82,
          });
          if (unknownMaterial.suffixRawValue) {
            suffixes.push(unknownMaterial.suffixRawValue);
          }
        } else {
          suffixes.push(normalizedPart);
        }
      }
      continue;
    }

    const suffix = normalizedPart.slice(match.normalized.length);
    if (!isSafeMaterialPrefixMatch(match, suffix)) continue;

    materialTokens.push({
      rawText: match.displayText,
      normalized: match.normalized,
      suffix: suffix || undefined,
    });
    if (suffix) {
      suffixes.push(suffix);
    }
  }

  if (materialTokens.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const tokens: MultiValueToken[] = [];
  for (const token of materialTokens) {
    if (seen.has(token.normalized)) continue;
    seen.add(token.normalized);
    tokens.push({
      value: token.normalized,
      rawText: token.rawText,
      source: "delimiter",
      confidence: token.suffix ? 0.9 : 1,
    });
  }

  const suffixRawValue = mergeMaterialSuffixes(suffixes);
  return {
    tokens: [...tokens, ...unmatchedStandaloneTokens],
    split: {
      sourceRawValue: trimmed,
      matchedMaterialTokens: tokens.map((token) => token.rawText),
      suffixRawValue,
      suffixCandidateTermType: suffixRawValue ? "application" : undefined,
    },
  };
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
  materialPrefixSplit?: MaterialPrefixSplitResult;
} {
  const tokens = extractMultiValueTokens(
    rawValue,
    context.splitRawValues,
    termType.termType,
  );
  const materialPrefixSplit =
    termType.termType === "plastic_material" && !context.splitRawValues?.length
      ? splitPlasticMaterialPrefixTokens(rawValue, context.aliasMap)
      : null;
  const tokensToMatch = materialPrefixSplit?.tokens ?? tokens;

  const values: NormalizedEnumValue[] = [];
  const unmatchedTokens: string[] = [];
  const seenCanonical = new Set<string>();

  for (const token of tokensToMatch) {
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
    materialPrefixSplit: materialPrefixSplit?.split,
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
  materialPrefixSplit?: MaterialPrefixSplitResult;
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
    materialPrefixSplit: params.materialPrefixSplit,
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

function activeMaterialAliasTokens(aliasMap: Map<string, CachedValueAlias>) {
  const tokens = new Map<string, { normalized: string; displayText: string }>();
  for (const [key, alias] of aliasMap.entries()) {
    if (alias.termType !== "plastic_material") continue;
    const normalized = key.startsWith("plastic_material:")
      ? key.slice("plastic_material:".length)
      : "";
    if (!normalized || normalized.length < 2) continue;
    tokens.set(normalized, {
      normalized,
      displayText: alias.displayName ?? alias.canonicalValue ?? normalized,
    });
  }
  return [...tokens.values()].sort(
    (left, right) => right.normalized.length - left.normalized.length,
  );
}

function splitMaterialCandidateParts(value: string): string[] {
  return value
    .split(/[、，,;；\/＋+\n\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseMaterialCandidatePart(value: string): ParsedMaterialCandidatePart {
  const normalized = normalizeText(value).replace(/^(?:原料|塑料原料|适用塑料原料)[:：]?/, "");
  const stripped = normalized.replace(
    /^(?:[\(（]?\d+(?:\.\d+)?%[\)）]?|百分之[一二三四五六七八九十百千万0-9.]+)+/,
    "",
  );
  return {
    normalized: stripped,
    hadCompositionPrefix: stripped !== normalized,
  };
}

function isIgnorablePlasticMaterialToken(value: string): boolean {
  if (!value) return true;
  if (/^(?:原料|塑料原料|适用塑料原料|℃|度|kg|公斤|每小时)$/.test(value)) {
    return true;
  }
  return /^(?:工艺温度|正常使用产量|产量|密度|线速度|熔指|mfr)[:：]?.*/.test(value);
}

function isSafeMaterialPrefixMatch(
  alias: { normalized: string },
  suffix: string,
): boolean {
  if (!suffix) return true;
  if (alias.normalized.length >= 3) return true;
  return /[\u4e00-\u9fff]/u.test(suffix);
}

function looksLikeStandaloneMaterialToken(value: string): boolean {
  return /^[a-z]{2,8}[0-9a-z-]*$/i.test(value);
}

function looksLikeUnknownCompositionMaterial(value: string): boolean {
  const parsed = splitUnknownCompositionMaterial(value);
  if (!parsed?.suffixRawValue) return false;
  return looksLikeUnknownMaterialStem(parsed.materialRawValue);
}

function looksLikeUnknownMaterialStem(value: string): boolean {
  return /(淀粉|碳酸钙|钙粉|滑石粉|粉|母粒|树脂|填充|色母|助剂)$/.test(
    value,
  );
}

function splitUnknownCompositionMaterial(value: string):
  | {
      materialRawValue: string;
      suffixRawValue?: string;
    }
  | null {
  const suffixMatch = value.match(
    /(片材模头|片材|板材|板|薄膜|流延膜|膜|模头|生产线|挤出线|管材|型材)$/,
  );
  if (!suffixMatch || suffixMatch.index === undefined || suffixMatch.index <= 0) {
    return {
      materialRawValue: value,
    };
  }

  const materialRawValue = value.slice(0, suffixMatch.index).trim();
  if (!materialRawValue) return null;
  return {
    materialRawValue,
    suffixRawValue: suffixMatch[0],
  };
}

function mergeMaterialSuffixes(suffixes: string[]): string | undefined {
  const cleaned = [
    ...new Set(
      suffixes
        .map((suffix) => suffix.trim())
        .filter(Boolean),
    ),
  ];
  if (cleaned.length === 0) return undefined;
  return cleaned.join("、");
}

function valueAliasKeyForLookup(
  termType: string,
  normalizedAlias: string,
): string {
  return `${termType}:${normalizedAlias}`;
}
