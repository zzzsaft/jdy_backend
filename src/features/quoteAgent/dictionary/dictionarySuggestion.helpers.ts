import type { DictionaryTermType } from "./entity/index.js";

export const TERM_TYPE_REVIEW_ACTIONS = [
  "create_term_type",
  "approve_as_alias",
  "reject",
  "needs_human_review",
];

export const VALUE_REVIEW_ACTIONS = [
  "create_value",
  "approve_as_alias",
  "move_to_other_term_type",
  "split_value",
  "reject",
  "needs_human_review",
];

export const CLUSTER_REVIEW_ACTIONS = [
  ...new Set([...TERM_TYPE_REVIEW_ACTIONS, ...VALUE_REVIEW_ACTIONS]),
];

export type CandidateClusterInput = {
  clusterId: string;
  readableClusterId: string;
  clusterLabel: string;
  clusterKey: string;
  candidateType: "term_type" | "value";
  candidateIds: string[];
  termType?: string;
  normalizedRawValue?: string;
  normalizedFieldName?: string;
  rawValueSamples: string[];
  rawFieldNameSamples: string[];
  normalizedFieldNameSamples: string[];
  sourceProductType: string;
  reason: string | null;
  occurrenceCount: number;
  documentCount: number;
  commonContexts: string[];
  sampleOccurrences: Array<{
    documentId: string;
    fileName: string | null;
    itemIndex: number | null;
    itemName: string | null;
    rawFieldName: string;
    rawValue: string | null;
  }>;
};

export type CandidateClusterBuildParams = {
  status?: string;
  documentId?: number;
  clusterIds?: string[];
  termTypeCandidateIds?: string[];
  valueCandidateIds?: string[];
  limit?: number;
};

export type ClusterBatchReviewRunPolicy = {
  confidenceThreshold: number;
  maxSuggestedAliases: number;
  allowSplitValue: boolean;
};

export function buildPrompt(params: {
  rawFieldName: string;
  rawValue?: string | null;
}) {
  return `浣犳槸鍒堕€犱笟鎶ヤ环瀛楁瀛楀吀鍛藉悕鍔╂墜銆傛妸涓枃瀛楁鍚嶈浆鎴愮ǔ瀹氳嫳鏂?snake_case key锛屽苟缁欏嚭3-5涓彲浣滀负鍒悕鐨勪腑鏂囧彨娉曘€?
瀛楁鍚? ${params.rawFieldName}
绀轰緥鍊? ${params.rawValue ?? ""}

鐩存帴杈撳嚭:
{"termType":"english_snake_case_key","displayName":"涓枃鏄剧ず鍚?,"aliases":["涓枃鍒悕1","涓枃鍒悕2","涓枃鍒悕3"]}`;
}

export function buildValueSplitPrompt(params: {
  termType: string;
  rawValue: string;
  termTypes: DictionaryTermType[];
}) {
  const termTypesText = params.termTypes
    .map(
      (item) => `- ${item.termType}: ${item.displayName} (${item.valueKind})`,
    )
    .join("\n");

  return `浣犳槸鍒堕€犱笟鎶ヤ环瀛楁鍊兼媶鍒嗗姪鎵嬨€傛妸澶嶅悎瀛楁鍊兼媶鎴愬涓凡鏈夊瓧娈?Key 鐨勬爣鍑嗗€笺€傚彧浣跨敤涓嬮潰瀛楁 Key銆?

宸叉湁瀛楁 Key:
${termTypesText}

鏉ユ簮瀛楁 Key: ${params.termType}
澶嶅悎瀛楁鍊? ${params.rawValue}

鐩存帴杈撳嚭:
{"suggestions":[{"termType":"plastic_material","displayName":"濉戞枡鍘熸枡","canonicalValue":"CPE","aliases":["CPE"]},{"termType":"application_type","displayName":"搴旂敤绫诲瀷","canonicalValue":"缂犵粫鑶?,"aliases":["娴佸欢缂犵粫鑶?,"缂犵粫鑶?]}]}`;
}

export function sanitizeTermType(input: unknown, fallback: string) {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return value || fallback;
}

export function parseSuggestionJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = fenced?.[1] ?? trimmed;
  const jsonText = unfenced.match(/\{[\s\S]*\}/)?.[0] ?? unfenced;
  return JSON.parse(jsonText);
}

export function uniqueAliases(values: unknown[], rawFieldName: string) {
  return [
    ...new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value && value !== rawFieldName),
    ),
  ].slice(0, 5);
}

export function normalizeSplitSuggestions(value: unknown) {
  const rawSuggestions = Array.isArray((value as any)?.suggestions)
    ? (value as any).suggestions
    : [];

  return rawSuggestions
    .map((item) => ({
      termType: String(item?.termType ?? "").trim(),
      displayName: String(item?.displayName ?? "").trim() || undefined,
      canonicalValue: String(item?.canonicalValue ?? "").trim(),
      aliases: Array.isArray(item?.aliases)
        ? uniqueAliases(item.aliases, "")
        : [],
    }))
    .filter((item) => item.termType && item.canonicalValue)
    .slice(0, 8);
}

export function normalizeTermTypeReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: TERM_TYPE_REVIEW_ACTIONS.includes(action)
      ? action
      : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "?????????",
    sourceProductType: asStringOrNull(value?.sourceProductType),
    itemIndex: asIntegerOrNull(value?.itemIndex),
    suggestedTermType: asStringOrNull(value?.suggestedTermType),
    suggestedDisplayName: asStringOrNull(value?.suggestedDisplayName),
    suggestedQuoteDisplayName: asStringOrNull(value?.suggestedQuoteDisplayName),
    suggestedDescription: asStringOrNull(value?.suggestedDescription),
    suggestedCategory: asStringOrNull(value?.suggestedCategory),
    suggestedSortOrder: asIntegerOrNull(value?.suggestedSortOrder),
    suggestedValueKind: asStringOrNull(value?.suggestedValueKind),
    suggestedApplicableProductTypes: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypes,
    ),
    suggestedAliases: normalizeSuggestionAliases(value?.suggestedAliases),
    suggestedValues: normalizeSuggestedValues(value?.suggestedValues),
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(
      value?.targetTermTypeApplicableMismatch,
    ),
    suggestedApplicableProductTypesToAdd: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypesToAdd,
    ),
  };
}

export function normalizeValueReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: VALUE_REVIEW_ACTIONS.includes(action)
      ? action
      : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "?????????",
    sourceProductType: asStringOrNull(value?.sourceProductType),
    itemIndex: asIntegerOrNull(value?.itemIndex),
    canonicalValue: asStringOrNull(value?.canonicalValue),
    displayName: asStringOrNull(value?.displayName),
    suggestedAliases: normalizeSuggestionAliases(value?.suggestedAliases),
    targetTermId: asStringOrNull(value?.targetTermId),
    targetCanonicalValue: asStringOrNull(value?.targetCanonicalValue),
    targetDisplayName: asStringOrNull(value?.targetDisplayName),
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(
      value?.targetTermTypeApplicableMismatch,
    ),
    suggestedApplicableProductTypesToAdd: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypesToAdd,
    ),
    movedFieldName: asStringOrNull(value?.movedFieldName),
    movedRawValue: asStringOrNull(value?.movedRawValue),
    splits: normalizeReviewSplits(value?.splits),
  };
}

export function normalizeClusterReviewSuggestion(
  value: any,
  cluster: CandidateClusterInput,
) {
  const rawAction = String(value?.recommendedAction ?? "").trim();
  const allowedActions =
    cluster.candidateType === "term_type"
      ? TERM_TYPE_REVIEW_ACTIONS
      : VALUE_REVIEW_ACTIONS;
  const recommendedAction =
    allowedActions.includes(rawAction) && CLUSTER_REVIEW_ACTIONS.includes(rawAction)
      ? rawAction
      : "needs_human_review";
  const riskLevel = String(value?.riskLevel ?? "").trim();
  const batchOperationsPreview =
    recommendedAction === "needs_human_review"
      ? []
      : normalizeBatchOperationsPreview(value?.batchOperationsPreview, {
          candidateType: cluster.candidateType,
          candidateIds: cluster.candidateIds,
        });

  return {
    clusterId: cluster.clusterId,
    candidateType: cluster.candidateType,
    candidateIds: cluster.candidateIds,
    recommendedAction,
    confidence: asNumberOrNull(value?.confidence),
    riskLevel: ["low", "medium", "high"].includes(riskLevel)
      ? riskLevel
      : "medium",
    needsHumanReview: recommendedAction === "needs_human_review",
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
    humanReviewSummary:
      asStringOrNull(value?.humanReviewSummary) ?? "需要人工确认该候选簇",
    sourceProductType:
      asStringOrNull(value?.sourceProductType) ?? cluster.sourceProductType,
    occurrenceCount: cluster.occurrenceCount,
    documentCount: cluster.documentCount,
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(
      value?.targetTermTypeApplicableMismatch,
    ),
    suggestedApplicableProductTypesToAdd: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypesToAdd,
    ),
    suggestedTermType: asStringOrNull(value?.suggestedTermType),
    suggestedDisplayName: asStringOrNull(value?.suggestedDisplayName),
    suggestedQuoteDisplayName: asStringOrNull(value?.suggestedQuoteDisplayName),
    suggestedDescription: asStringOrNull(value?.suggestedDescription),
    suggestedCategory: asStringOrNull(value?.suggestedCategory),
    suggestedSortOrder: asIntegerOrNull(value?.suggestedSortOrder),
    suggestedValueKind: asStringOrNull(value?.suggestedValueKind),
    suggestedApplicableProductTypes: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypes,
    ),
    canonicalValue: asStringOrNull(value?.canonicalValue),
    displayName: asStringOrNull(value?.displayName),
    suggestedAliases: normalizeSuggestionAliases(value?.suggestedAliases),
    targetTermId: asStringOrNull(value?.targetTermId),
    targetCanonicalValue: asStringOrNull(value?.targetCanonicalValue),
    targetDisplayName: asStringOrNull(value?.targetDisplayName),
    movedFieldName: asStringOrNull(value?.movedFieldName),
    movedRawValue: asStringOrNull(value?.movedRawValue),
    splits: normalizeReviewSplits(value?.splits),
    batchOperationsPreview,
  };
}

export function uniqueLimited(values: unknown[], limit: number): string[] {
  return [
    ...new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

export function clusterKey(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("\u0000");
}

export function clusterId(parts: Array<string | null | undefined>): string {
  return parts.map((part) => encodeURIComponent(String(part ?? ""))).join(":");
}

export function readableClusterId(
  parts: Array<string | null | undefined>,
): string {
  return parts.map((part) => String(part ?? "")).join(":");
}

export function clusterLabel(parts: Array<string | null | undefined>): string {
  const [candidateType, ...rest] = parts.map((part) => String(part ?? ""));
  const typeLabel = candidateType === "term_type" ? "字段候选" : "字段值候选";
  return [typeLabel, ...rest.filter(Boolean)].join(" / ");
}

export function textFromEvidence(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== "object") return [];
  const source = evidence as Record<string, unknown>;
  return uniqueLimited(
    [
      source.itemName,
      source.context,
      source.rawText,
      source.sourceRawValue,
      source.splitFromRawValue,
    ],
    5,
  );
}

export function confidenceToDb(value: number | null): string | null {
  return value === null ? null : value.toFixed(3);
}

function asStringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function asIntegerOrNull(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

export function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSuggestionAliases(value: unknown): string[] {
  return [
    ...new Set(
      asArray(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

function normalizeSuggestedProductTypes(value: unknown): string[] {
  return [
    ...new Set(
      asArray(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeSuggestedValues(value: unknown) {
  return asArray(value)
    .map((item) => ({
      canonicalValue: asStringOrNull(item?.canonicalValue),
      displayName: asStringOrNull(item?.displayName),
      aliases: normalizeSuggestionAliases(item?.aliases),
    }))
    .filter((item) => item.canonicalValue)
    .slice(0, 12);
}

function normalizeReviewSplits(value: unknown) {
  return asArray(value)
    .map((item) => ({
      termType: asStringOrNull(item?.termType),
      displayName: asStringOrNull(item?.displayName),
      canonicalValue: asStringOrNull(item?.canonicalValue),
      aliases: normalizeSuggestionAliases(item?.aliases),
      applicableProductTypes: normalizeSuggestedProductTypes(
        item?.applicableProductTypes,
      ),
    }))
    .filter((item) => item.termType || item.canonicalValue)
    .slice(0, 8);
}

function normalizeBatchOperationsPreview(
  value: unknown,
  expected?: {
    candidateType: "term_type" | "value";
    candidateIds: string[];
  },
) {
  const expectedCandidateIds = new Set(expected?.candidateIds ?? []);
  return asArray(value)
    .map((item) => {
      const candidateType = String(item?.candidateType ?? "").trim();
      const candidateId = String(item?.candidateId ?? "").trim();
      const action = normalizeBatchOperationAction(
        candidateType,
        String(item?.action ?? "").trim(),
      );
      if (
        (candidateType !== "term_type" && candidateType !== "value") ||
        (expected && candidateType !== expected.candidateType) ||
        (expected && !expectedCandidateIds.has(candidateId)) ||
        !candidateId ||
        !action ||
        !isAllowedBatchOperationAction(candidateType, action)
      ) {
        return null;
      }
      return {
        candidateType,
        candidateId,
        action,
        payload:
          item?.payload && typeof item.payload === "object"
            ? item.payload
            : {},
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function normalizeBatchOperationAction(
  candidateType: string,
  action: string,
): string {
  if (candidateType === "term_type" && action === "approve_as_alias") {
    return "approve_term_type_as_alias";
  }
  if (candidateType === "value" && action === "approve_as_alias") {
    return "approve_value_as_alias";
  }
  if (candidateType === "value" && action === "move_to_other_term_type") {
    return "move_value_to_other_term_type";
  }
  return action;
}

function isAllowedBatchOperationAction(
  candidateType: string,
  action: string,
): boolean {
  if (candidateType === "term_type") {
    return ["create_term_type", "approve_term_type_as_alias", "reject"].includes(
      action,
    );
  }
  if (candidateType === "value") {
    return [
      "create_value",
      "approve_value_as_alias",
      "split_value",
      "move_value_to_other_term_type",
      "update_term_type_value_kind",
      "reject",
    ].includes(action);
  }
  return false;
}
