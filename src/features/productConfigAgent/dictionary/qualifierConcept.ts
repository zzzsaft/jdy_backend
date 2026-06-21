import type {
  DictionaryExtractionQualifier,
  DictionaryExtractionQualifierArea,
  DictionaryExtractionQualifierPosition,
} from "../normalization/types.js";
import {
  getRuntimeQualifierMatcher,
  type RuntimeQualifierMatch,
} from "./qualifierMatcher.js";

type QualifierRule = {
  pattern: RegExp;
  stripFromFieldName?: boolean;
};

const LEGACY_POSITION_KEYS: Record<string, DictionaryExtractionQualifierPosition> = {
  upper_mold: "upper_die",
  lower_mold: "lower_die",
};

const RANGE_QUALIFIER_RULES: QualifierRule[] = [
  { pattern: /上限|最大/ },
  { pattern: /下限|最小/ },
  { pattern: /第一|第二|第三|第[一二三四五六七八九十0-9]+套/ },
  { pattern: /前段|后段|内侧|外侧|左侧|右侧/ },
];

const LETTER_LAYER_PATTERN = /([A-ZＡ-Ｚ])\s*层/i;
const INDEX_LAYER_PATTERN = /第\s*([0-9一二三四五六七八九十]+)\s*层/;
const LIP_INSTANCE_PATTERN =
  /第?\s*([0-9一二三四五六七八九十]+)\s*(?:套|Sheet)(?=.*(?:模唇|开口|厚度|间隙))/i;
const LIP_INSTANCE_PREFIX_PATTERN =
  /第?\s*([0-9一二三四五六七八九十]+)\s*(?:套|Sheet)/i;

export const QUALIFIER_CONCEPT_PATTERN = {
  test(value: string): boolean {
    const text = String(value ?? "");
    return (
      getRuntimeQualifierMatcher().conceptPattern.test(text.replace(/\s+/g, "")) ||
      RANGE_QUALIFIER_RULES.some((rule) => rule.pattern.test(text)) ||
      LETTER_LAYER_PATTERN.test(text) ||
      INDEX_LAYER_PATTERN.test(text) ||
      LIP_INSTANCE_PATTERN.test(text)
    );
  },
};

export function detectQualifierConcept(params: {
  fieldName?: string | null;
  rawValue?: string | null;
  evidence?: unknown;
}): {
  originalFieldName: string;
  baseFieldName: string;
  qualifier?: DictionaryExtractionQualifier;
  sourceText?: string;
  hadQualifierText: boolean;
  matchedQualifierAlias?: string;
  qualifierKey?: string;
  qualifierKind?: string;
  rule?: string;
} | null {
  const evidence = objectRecord(params.evidence);
  const originalFieldName = String(
    evidence?.originalFieldName ??
      params.fieldName ??
      "",
  ).trim();
  const texts = [
    originalFieldName,
    evidence?.originalFieldName,
    evidence?.sourceRawFieldName,
    evidence?.text,
    params.rawValue,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const joined = texts.join(" ");
  const bothMoldSourceText = texts.find((value) =>
    /上下模|上\/下模|上、下模|上和下模/.test(value.replace(/\s+/g, "")),
  );
  if (bothMoldSourceText) {
    return {
      originalFieldName,
      baseFieldName: String(evidence?.baseFieldName ?? originalFieldName).trim() || originalFieldName,
      sourceText: bothMoldSourceText,
      hadQualifierText: true,
      matchedQualifierAlias: bothMoldSourceText.match(/上下模|上\/下模|上、下模|上和下模/)?.[0],
      qualifierKey: "upper_die,lower_die",
      qualifierKind: "position",
      rule: "both_mold_qualifier",
    };
  }
  const explicitQualifier = normalizeQualifier(evidence?.qualifier);
  let qualifier: DictionaryExtractionQualifier | undefined = explicitQualifier;
  let sourceText = qualifier?.sourceText;
  let baseFieldName = String(evidence?.baseFieldName ?? originalFieldName).trim();
  const stripPatterns: RegExp[] = [];
  const runtimeMatches: RuntimeQualifierMatch[] = [];
  const layer = detectLayerQualifier(texts);
  if (layer) {
    qualifier = {
      ...qualifier,
      layer: qualifier?.layer ?? layer.layer,
      layerIndex: qualifier?.layerIndex ?? layer.layerIndex,
      sourceText: qualifier?.sourceText ?? layer.sourceText,
    };
    sourceText ??= layer.sourceText;
    stripPatterns.push(LETTER_LAYER_PATTERN, INDEX_LAYER_PATTERN);
  }
  const lipInstance = detectLipInstanceQualifier(texts);
  if (lipInstance) {
    qualifier = {
      ...qualifier,
      area: qualifier?.area ?? "lip",
      instanceIndex: qualifier?.instanceIndex ?? lipInstance.instanceIndex,
      sourceText: qualifier?.sourceText ?? lipInstance.sourceText,
    };
    sourceText ??= lipInstance.sourceText;
    stripPatterns.push(LIP_INSTANCE_PREFIX_PATTERN);
  }

  for (const text of texts) {
    const runtime = getRuntimeQualifierMatcher().detect([text]);
    if (runtime.matches.length > 0) {
      runtimeMatches.push(...runtime.matches);
      qualifier = {
        ...qualifier,
        position: qualifier?.position ?? runtime.qualifier?.position,
        area: qualifier?.area ?? runtime.qualifier?.area,
        layer: qualifier?.layer ?? runtime.qualifier?.layer,
        sourceText: qualifier?.sourceText ?? sourceText ?? runtime.sourceText,
      };
      sourceText ??= qualifier.sourceText;
      for (const match of runtime.matches) {
        if (match.stripFromFieldName) {
          stripPatterns.push(match.stripPattern);
        }
      }
    }
    const compact = text.replace(/\s+/g, "");
    for (const rule of RANGE_QUALIFIER_RULES) {
      if (rule.pattern.test(compact) && rule.stripFromFieldName) {
        stripPatterns.push(rule.pattern);
        sourceText ??= matchSourceText(compact, rule.pattern);
      }
    }
  }

  if (originalFieldName && (!baseFieldName || baseFieldName === originalFieldName)) {
    baseFieldName = stripQualifierText(originalFieldName, stripPatterns);
    baseFieldName = normalizeLayerBaseFieldName(baseFieldName);
  }

  const hadQualifierText = Boolean(
    qualifier?.position ||
      qualifier?.area ||
      qualifier?.layer ||
      qualifier?.layerIndex ||
      qualifier?.instanceIndex,
  ) ||
    QUALIFIER_CONCEPT_PATTERN.test(joined);
  if (!hadQualifierText) {
    return null;
  }
  const primaryRuntimeMatch = runtimeMatches[0];

  return {
    originalFieldName,
    baseFieldName: baseFieldName || originalFieldName,
    qualifier,
    sourceText,
    hadQualifierText,
    matchedQualifierAlias: primaryRuntimeMatch?.matchedAlias,
    qualifierKey: primaryRuntimeMatch?.qualifierKey,
    qualifierKind: primaryRuntimeMatch?.qualifierKind,
    rule: primaryRuntimeMatch ? "runtime_qualifier_matcher" : undefined,
  };
}

function stripQualifierText(value: string, patterns: RegExp[]): string {
  let result = value.replace(/\s+/g, "");
  for (const pattern of patterns) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\s+/g, "").trim() || value;
}

function normalizeQualifier(value: unknown): DictionaryExtractionQualifier | undefined {
  const record = objectRecord(value);
  if (!record) return undefined;
  const qualifier: DictionaryExtractionQualifier = {};
  if (typeof record.position === "string") {
    qualifier.position =
      LEGACY_POSITION_KEYS[record.position] ??
      (record.position as DictionaryExtractionQualifierPosition);
  }
  if (typeof record.area === "string") {
    qualifier.area = record.area as DictionaryExtractionQualifierArea;
  }
  if (typeof record.layer === "string") {
    qualifier.layer = record.layer;
  }
  if (typeof record.layerIndex === "number") {
    qualifier.layerIndex = record.layerIndex;
  } else if (typeof record.layer_index === "number") {
    qualifier.layerIndex = record.layer_index;
  }
  if (typeof record.instanceIndex === "number") {
    qualifier.instanceIndex = record.instanceIndex;
  } else if (typeof record.instance_index === "number") {
    qualifier.instanceIndex = record.instance_index;
  }
  if (typeof record.sourceText === "string") {
    qualifier.sourceText = record.sourceText;
  } else if (typeof record.source_text === "string") {
    qualifier.sourceText = record.source_text;
  }
  return qualifier.position ||
    qualifier.area ||
    qualifier.layer ||
    qualifier.layerIndex ||
    qualifier.instanceIndex
    ? qualifier
    : undefined;
}

function detectLayerQualifier(texts: string[]): {
  layer?: string;
  layerIndex?: number;
  sourceText: string;
} | undefined {
  for (const text of texts) {
    const compact = text.replace(/\s+/g, "");
    const letterMatch = compact.match(LETTER_LAYER_PATTERN);
    if (letterMatch?.[1]) {
      return {
        layer: normalizeLayerLetter(letterMatch[1]),
        sourceText: letterMatch[0],
      };
    }
    const indexMatch = compact.match(INDEX_LAYER_PATTERN);
    if (indexMatch?.[1]) {
      const layerIndex = chineseNumberToInt(indexMatch[1]);
      if (layerIndex) {
        return {
          layerIndex,
          sourceText: indexMatch[0],
        };
      }
    }
  }
  return undefined;
}

function normalizeLayerLetter(value: string): string {
  return value
    .replace(/[Ａ-Ｚ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .toUpperCase();
}

function normalizeLayerBaseFieldName(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (/^(?:配)?(?:挤出机)?型号$/.test(compact)) return "挤出机型号";
  if (/^(?:配)?(?:挤出机)?(?:产量|产能)$/.test(compact)) return "层产量";
  if (/^(?:原料|材料|塑料原料)$/.test(compact)) return "层原料";
  if (/^(?:比例|占比|结构比例)$/.test(compact)) return "层比例";
  if (/^(?:模唇)?(?:厚度|开口|间隙)$/.test(compact)) return "模唇厚度";
  return value;
}

function detectLipInstanceQualifier(texts: string[]): {
  instanceIndex: number;
  sourceText: string;
} | undefined {
  const joined = texts.join(" ").replace(/\s+/g, "");
  if (!/(模唇|开口|厚度|间隙)/.test(joined)) {
    return undefined;
  }

  for (const text of texts) {
    const compact = text.replace(/\s+/g, "");
    const match = compact.match(LIP_INSTANCE_PREFIX_PATTERN);
    if (!match?.[1]) {
      continue;
    }
    const instanceIndex = chineseNumberToInt(match[1]);
    if (instanceIndex) {
      return {
        instanceIndex,
        sourceText: match[0],
      };
    }
  }

  return undefined;
}

function chineseNumberToInt(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? digits[tens] ?? 1 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[value];
}

function matchSourceText(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[0];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
