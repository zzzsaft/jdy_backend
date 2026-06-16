import { normalizeText } from "./dictionary.utils.js";
import type {
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
} from "./entity/index.js";

export function normalizeProductTypeHintForMatch(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
}

export function isExplicitNumberUnitSplitField(value: string): boolean {
  return [
    "\u5f00\u53e3",
    "\u5f00\u6863",
    "\u4e0b\u6a21\u5507\u5f00\u6863",
  ].includes(value.trim());
}

export function splitResolutionLookupKey(params: {
  documentId: string;
  extractionResultId: string;
  itemIndex: number;
  rawValue: string;
}): string {
  return [
    params.documentId,
    params.extractionResultId,
    params.itemIndex,
    normalizeText(params.rawValue),
  ].join("|");
}

export function candidateSplitResolutionRawValues(
  candidate: Pick<DictionaryCandidate, "rawValue"> & {
    evidence?: DictionaryCandidateOccurrence["evidence"];
  },
): string[] {
  const evidence =
    candidate.evidence && typeof candidate.evidence === "object"
      ? (candidate.evidence as Record<string, unknown>)
      : {};
  return [
    candidate.rawValue,
    evidence.sourceRawValue,
    evidence.splitFromRawValue,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

