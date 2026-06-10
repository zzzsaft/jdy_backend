import { DataSource, In } from "typeorm";
import OpenAI from "openai";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryCandidateReviewSuggestion,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryTermTypeCandidate,
  DictionaryTermTypeSuggestion,
  DictionaryValueSplitSuggestion,
} from "./entity/index.js";
import { ExtractionResults } from "../entity/extractionResults.entity.js";
import { normalizeText } from "./dictionary.utils.js";
import { getLocalModelClient, getLocalModelName } from "../../../llm/index.js";
import { finishLlmCallLog, startLlmCallLog } from "../../../llm/index.js";

const SUGGEST_TERM_TYPE_SYSTEM_PROMPT =
  "只输出最终 JSON。不要解释，不要推理，不要 Markdown。JSON 必须包含 termType, displayName, aliases。";

const BATCH_REVIEW_SYSTEM_PROMPT = `你是 quoteAgent 字典候选批量预审助手。

只输出合法 JSON，不要 Markdown，不要解释，不要代码块。输出必须能被 JSON.parse 解析。

输入包含：

* productTypes：正式产品类型字典，来自 term_type = product_type 的 dictionary_terms，含 canonicalValue、displayName。
* termTypes：现有字段 Key 列表，含 termType、displayName、quoteDisplayName、valueKind、category、aliases、applicableProductTypes。
* enumValues：enum/enums 字段下已有标准值摘要，含 termId、termType、canonicalValue、displayName、aliases。
* termTypeCandidates：字段 Key 候选。
* valueCandidates：字段值候选。

产品类型规则：

1. productTypes 是正式产品类型字典，仅用于理解 sourceProductType 和 applicableProductTypes。
2. sourceProductType 表示候选来源 item 的产品类型，由 extraction 的 product_type_hint / itemProductTypeHint 得到。
3. sourceProductType 不是字段 Key，不是 termType，不要创建 product_type_hint 之类的 termType。
4. sourceProductType 只能作为候选审核上下文，用于判断字段是否适用于当前产品。
5. product_type 是正式字典字段，product_type_hint / item_type_hint 不是正式字典字段。
6. applicableProductTypes 表示某个 termType 适用的产品类型，取值应来自 productTypes 的 canonicalValue，或 common。
7. common 表示通用字段，适用于所有产品。
8. 如果 applicableProductTypes 为空、缺失或 null，视为历史兼容字段，不要仅因此拒绝匹配，但 reason 中可以提示需要补充适用产品类型。
9. 如果候选来自 sourceProductType = metering_pump，优先匹配 applicableProductTypes 包含 metering_pump 或 common 的 termType。
10. 如果候选来自 sourceProductType = filter，优先匹配 applicableProductTypes 包含 filter 或 common 的 termType。
11. 如果候选来自 sourceProductType = flat_die，优先匹配 applicableProductTypes 包含 flat_die 或 common 的 termType。
12. 如果目标 termType 的 applicableProductTypes 明显不包含 sourceProductType，也不包含 common，不要直接高置信 approve；应返回 needs_human_review，或在允许的情况下提示需要追加 applicableProductTypes。
13. 不要把具体型号、规格、压力、排量、尺寸等做成 product_type 或 enum value。
14. 不要把“双柱换网器 / 高压过滤器 / 10ccm / 25MPa”等价格敏感信息压扁成 product_type。
15. 子类型、结构类型可以作为独立 termType，例如 filter_structure_type、metering_pump_series、hydraulic_station_type，但具体型号应为 text 字段。

正式 product_type 常见取值包括：

* flat_die：平模头
* filter：过滤器 / 换网器
* metering_pump：计量泵
* feedblock：分配器
* die_cart：模具小车
* hydraulic_station：液压站
* melt_pipe：熔体管道 / 连接器 / 联结器 / 联接器
* blown_film_die：吹膜模头 / 圆模
* coating_die：涂布模头
* unknown：未知

重要规则：

1. termTypeCandidates 是“字段 Key 候选”，只用于判断 rawFieldName 应该如何处理。

   * 判断依据主要是 rawFieldName / normalizedFieldName。
   * sourceProductType / itemIndex / itemName / rawValue 只能作为上下文辅助。
   * rawValue 不能作为主要依据；不能因为 rawValue 匹配某个 enum value 就把 termType candidate 审核为 value alias。
   * approve_as_alias 必须填写 targetTermType 和 targetTermTypeDisplayName。
   * approve_as_alias 的 suggestedAliases 应包含 rawFieldName 或其合理别名。
   * termTypeCandidateSuggestions 中不要输出 suggestedValues，除非 recommendedAction 是 create_term_type 且 suggestedValueKind 是 enum。
   * 如果 recommendedAction = create_term_type，必须填写 suggestedApplicableProductTypes。
   * 如果候选来自明确 sourceProductType，create_term_type 的 suggestedApplicableProductTypes 默认应包含 sourceProductType。
   * 如果字段明显是通用字段，例如数量、备注、单位、产品名称、交货说明，suggestedApplicableProductTypes 可以为 ["common"]。
   * 如果字段适用于多个产品，suggestedApplicableProductTypes 可以包含多个 product_type，例如 ["flat_die", "coating_die", "blown_film_die"]。
   * 如果 approve_as_alias 的目标 termType 不适用于 sourceProductType，应设置 targetTermTypeApplicableMismatch = true，并在 suggestedApplicableProductTypesToAdd 中给出建议追加的产品类型；如果风险较高，recommendedAction 应改为 needs_human_review。

2. valueCandidates 是“字段值候选”，只用于判断 rawValue 应该如何处理。

   * approve_as_alias 必须填写 targetTermId、targetCanonicalValue、targetDisplayName。
   * create_value 必须填写 canonicalValue、displayName、suggestedAliases。
   * 如果 rawValue 语义明显不属于当前 termType，返回 move_to_other_term_type。
   * 如果 rawValue 包含多个配置项，返回 split_value。
   * valueCandidate 的 sourceProductType 只能用于判断当前 termType 是否适用于该产品，不能把 sourceProductType 当成 value。
   * 如果当前 termType 的 applicableProductTypes 不包含 sourceProductType，也不包含 common，应优先 needs_human_review 或 move_to_other_term_type，不要强行 approve_as_alias。
   * 如果 rawValue 是具体型号、压力、排量、尺寸、客户备注，一般不要 create_value；应 reject、move_to_other_term_type 或 needs_human_review，具体取决于字段类型。

3. 只有 value_kind = enum 的字段值才需要 dictionary value alias。

   * number、number_unit、boolean、text、date、number_or_boolean 不应创建 value alias。
   * 这些字段值应直接解析或保留原文。
   * 如果 valueCandidate.termType 的 valueKind 不是 enum，通常不要 create_value 或 approve_as_alias。
   * 如果非 enum 字段值被送入 valueCandidates，应优先 reject 或 needs_human_review，reason 说明该字段不是 enum，不需要字典值 alias。

4. 对不确定、证据不足、字段含义模糊、产品类型不匹配、可能影响报价但无法判断的候选，返回 needs_human_review，不要强行推荐。

5. key/value 错配检测：

   如果 valueCandidate.termType 对应字段含义与 rawValue 语义明显不一致，不要把 rawValue 塞进当前 termType。

   例如：
   termType=upper_lip_adjustment_method，rawValue=模唇厚度调节范围（0.8mm）

   应返回：
   recommendedAction=move_to_other_term_type
   targetTermType=lip_thickness_adjustment_range
   movedRawValue=0.8mm
   reason=字段值表达的是厚度调节范围，不是上模唇调节方式。

6. 产品错配检测：

   如果候选来源产品类型与字段含义明显不一致，不要直接 approve。

   例如：
   sourceProductType=flat_die，rawFieldName=排量，rawValue=10ccm

   如果现有 termType 中 metering_pump_displacement 适用于 metering_pump，则应返回：
   recommendedAction=needs_human_review 或 move_to_other_term_type
   reason=候选来自平模头 item，但“排量/10ccm”更像计量泵字段，存在产品归属错配。

   例如：
   sourceProductType=metering_pump，rawFieldName=模唇调节方式

   如果模唇调节方式仅适用于 flat_die / coating_die / blown_film_die，则应返回 needs_human_review，reason 说明字段来自计量泵 item 但字段语义属于模头类产品，可能是 item 拆分或字段归属错误。

7. 过滤器 / 换网器相关规则：

   * product_type = filter 只表示一级产品类型。
   * 双柱换网器、高压过滤器、液压换网器、连续换网器、板式换网器、柱塞式换网器等不应作为 product_type 的普通 enum value。
   * 这些应优先归入 filter_structure_type / filter_drive_method 等二级字段。
   * 如果 rawValue = 双柱液压换网器，应考虑 split_value：

     * filter_structure_type：双柱换网器
     * filter_drive_method：液压
   * 如果当前没有合适 termType，应 create_term_type，而不是把它压扁成 product_type=filter。

8. 计量泵相关规则：

   * 计量泵具体型号不应做 enum。
   * 排量、压差、出口压力应为 number_unit。
   * 计量泵系列/结构如果稳定有限，可以是 enum，例如 metering_pump_series。
   * 10ccm、25MPa、37MPa 等不应 create_value。

9. 液压站相关规则：

   * 液压站具体型号不应做 enum。
   * 功率、压力、油箱容量应为 number_unit。
   * 液压站类型如果稳定有限，可以是 enum，例如 hydraulic_station_type。
   * 不要把“液压”单独错误归入 product_type。

输出 JSON 格式：

{
"termTypeCandidateSuggestions": [
{
"candidateId": "string",
"recommendedAction": "create_term_type | approve_as_alias | reject | needs_human_review",
"confidence": 0.0,
"reason": "string",

  "sourceProductType": "string|null",
  "itemIndex": 1,

  "targetTermType": "string|null",
  "targetTermTypeDisplayName": "string|null",
  "targetTermTypeApplicableMismatch": false,
  "suggestedApplicableProductTypesToAdd": ["string"],

  "suggestedTermType": "string|null",
  "suggestedDisplayName": "string|null",
  "suggestedQuoteDisplayName": "string|null",
  "suggestedDescription": "string|null",
  "suggestedCategory": "string|null",
  "suggestedSortOrder": 100,
  "suggestedValueKind": "enum|enums|number|number_unit|text|boolean|date|number_or_boolean|null",
  "suggestedApplicableProductTypes": ["string"],
  "suggestedAliases": ["string"],
  "suggestedValues": [
    {
      "canonicalValue": "string",
      "displayName": "string",
      "aliases": ["string"]
    }
  ]
}


],
"valueCandidateSuggestions": [
{
"candidateId": "string",
"recommendedAction": "create_value | approve_as_alias | move_to_other_term_type | split_value | reject | needs_human_review",
"confidence": 0.0,
"reason": "string",


  "sourceProductType": "string|null",
  "itemIndex": 1,

  "canonicalValue": "string|null",
  "displayName": "string|null",
  "suggestedAliases": ["string"],

  "targetTermId": "string|null",
  "targetCanonicalValue": "string|null",
  "targetDisplayName": "string|null",

  "targetTermType": "string|null",
  "targetTermTypeDisplayName": "string|null",
  "targetTermTypeApplicableMismatch": false,
  "suggestedApplicableProductTypesToAdd": ["string"],

  "movedFieldName": "string|null",
  "movedRawValue": "string|null",

  "splits": [
    {
      "termType": "string",
      "displayName": "string|null",
      "canonicalValue": "string|null",
      "aliases": ["string"],
      "applicableProductTypes": ["string"]
    }
  ]
}


]
}

强制字段要求：

* termTypeCandidateSuggestions 中：

  * 每个 suggestion 必须原样带回 candidateId。
  * sourceProductType 如果输入中存在，必须原样带回；如果输入中不存在，输出 null。
  * itemIndex 如果输入中存在，必须原样带回；如果输入中不存在，输出 null。
  * approve_as_alias：targetTermType 必填，targetTermTypeDisplayName 必填。
  * approve_as_alias：suggestedAliases 必须非空。
  * approve_as_alias：如果目标 termType 的 applicableProductTypes 不包含 sourceProductType，也不包含 common，应设置 targetTermTypeApplicableMismatch = true，并填写 suggestedApplicableProductTypesToAdd；如果无法确认是否应追加，返回 needs_human_review。
  * create_term_type：suggestedTermType、suggestedDisplayName、suggestedValueKind、suggestedApplicableProductTypes 必填。
  * create_term_type：suggestedQuoteDisplayName 可等于 suggestedDisplayName。
  * create_term_type：suggestedDescription 用一句话说明字段含义。
  * create_term_type：suggestedCategory 使用已有 category，或 product_config / document_info。
  * create_term_type：suggestedSortOrder 输出整数，默认 100。
  * create_term_type：如果 sourceProductType 明确且不是 unknown，suggestedApplicableProductTypes 默认包含 sourceProductType。
  * create_term_type：如果字段是通用字段，suggestedApplicableProductTypes 输出 ["common"]。
  * reject：reason 必须说明为什么不是有效字段 Key。
  * needs_human_review：reason 必须说明不确定点。
  * suggestedValues 只能在 create_term_type 且 suggestedValueKind=enum/enums 时填写，否则必须为空数组。
  * targetTermTypeApplicableMismatch 默认 false。
  * suggestedApplicableProductTypesToAdd 没有建议时输出空数组。
  * suggestedApplicableProductTypes 没有建议时输出空数组。

* valueCandidateSuggestions 中：

  * 每个 suggestion 必须原样带回 candidateId。
  * sourceProductType 如果输入中存在，必须原样带回；如果输入中不存在，输出 null。
  * itemIndex 如果输入中存在，必须原样带回；如果输入中不存在，输出 null。
  * approve_as_alias：targetTermId、targetCanonicalValue、targetDisplayName 必填。
  * approve_as_alias：如果 valueCandidate.termType 的 applicableProductTypes 不包含 sourceProductType，也不包含 common，应设置 targetTermTypeApplicableMismatch = true，并填写 suggestedApplicableProductTypesToAdd；如果无法确认是否应追加，返回 needs_human_review。
  * create_value：canonicalValue、displayName、suggestedAliases 必填。
  * create_value：只允许用于 valueKind = enum 或 enums 的 termType。
  * move_to_other_term_type：targetTermType、targetTermTypeDisplayName、movedRawValue 必填。
  * split_value：splits 必须非空。
  * split_value：每个 split 的 termType 应优先选择适用于 sourceProductType 或 common 的字段。
  * reject：reason 必须说明为什么应拒绝。
  * needs_human_review：reason 必须说明不确定点。
  * targetTermTypeApplicableMismatch 默认 false。
  * suggestedApplicableProductTypesToAdd 没有建议时输出空数组。
  * suggestedAliases 没有建议时输出空数组。
  * splits 没有拆分时输出空数组。

不要遗漏任何 candidateId。
如果无法满足某个 action 的必填字段，请返回 needs_human_review。
`;

const TERM_TYPE_REVIEW_ACTIONS = [
  "create_term_type",
  "approve_as_alias",
  "reject",
  "needs_human_review",
];

const VALUE_REVIEW_ACTIONS = [
  "create_value",
  "approve_as_alias",
  "move_to_other_term_type",
  "split_value",
  "reject",
  "needs_human_review",
];

function buildPrompt(params: {
  rawFieldName: string;
  rawValue?: string | null;
}) {
  return `你是制造业报价字段字典命名助手。把中文字段名转成稳定英文 snake_case key，并给出3-5个可作为别名的中文叫法。
字段名: ${params.rawFieldName}
示例值: ${params.rawValue ?? ""}

直接输出:
{"termType":"english_snake_case_key","displayName":"中文显示名","aliases":["中文别名1","中文别名2","中文别名3"]}`;
}

function buildValueSplitPrompt(params: {
  termType: string;
  rawValue: string;
  termTypes: DictionaryTermType[];
}) {
  const termTypesText = params.termTypes
    .map(
      (item) => `- ${item.termType}: ${item.displayName} (${item.valueKind})`
    )
    .join("\n");

  return `你是制造业报价字段值拆分助手。把复合字段值拆成多个已有字段 Key 的标准值。只使用下面字段 Key。

已有字段 Key:
${termTypesText}

来源字段 Key: ${params.termType}
复合字段值: ${params.rawValue}

直接输出:
{"suggestions":[{"termType":"plastic_material","displayName":"塑料原料","canonicalValue":"CPE","aliases":["CPE"]},{"termType":"application_type","displayName":"应用类型","canonicalValue":"缠绕膜","aliases":["流延缠绕膜","缠绕膜"]}]}`;
}

function sanitizeTermType(input: unknown, fallback: string) {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return value || fallback;
}

function parseSuggestionJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = fenced?.[1] ?? trimmed;
  const jsonText = unfenced.match(/\{[\s\S]*\}/)?.[0] ?? unfenced;
  return JSON.parse(jsonText);
}

function uniqueAliases(values: unknown[], rawFieldName: string) {
  return [
    ...new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value && value !== rawFieldName)
    ),
  ].slice(0, 5);
}

function normalizeSplitSuggestions(value: unknown) {
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

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSuggestionAliases(value: unknown): string[] {
  return [
    ...new Set(
      asArray(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    ),
  ].slice(0, 10);
}

function normalizeSuggestedProductTypes(value: unknown): string[] {
  return [
    ...new Set(
      asArray(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
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
        item?.applicableProductTypes
      ),
    }))
    .filter((item) => item.termType || item.canonicalValue)
    .slice(0, 8);
}

function normalizeTermTypeReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: TERM_TYPE_REVIEW_ACTIONS.includes(action)
      ? action
      : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
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
      value?.suggestedApplicableProductTypes
    ),
    suggestedAliases: normalizeSuggestionAliases(value?.suggestedAliases),
    suggestedValues: normalizeSuggestedValues(value?.suggestedValues),
    targetTermType: asStringOrNull(value?.targetTermType),
    targetTermTypeDisplayName: asStringOrNull(value?.targetTermTypeDisplayName),
    targetTermTypeApplicableMismatch: asBoolean(
      value?.targetTermTypeApplicableMismatch
    ),
    suggestedApplicableProductTypesToAdd: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypesToAdd
    ),
  };
}

function normalizeValueReviewSuggestion(value: any, candidateId: string) {
  const action = String(value?.recommendedAction ?? "").trim();
  return {
    candidateId,
    recommendedAction: VALUE_REVIEW_ACTIONS.includes(action)
      ? action
      : "needs_human_review",
    confidence: asNumberOrNull(value?.confidence),
    reason: asStringOrNull(value?.reason) ?? "模型未给出明确理由",
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
      value?.targetTermTypeApplicableMismatch
    ),
    suggestedApplicableProductTypesToAdd: normalizeSuggestedProductTypes(
      value?.suggestedApplicableProductTypesToAdd
    ),
    movedFieldName: asStringOrNull(value?.movedFieldName),
    movedRawValue: asStringOrNull(value?.movedRawValue),
    splits: normalizeReviewSplits(value?.splits),
  };
}

function confidenceToDb(value: number | null): string | null {
  return value === null ? null : value.toFixed(3);
}

export class DictionarySuggestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly client: OpenAI = getLocalModelClient()
  ) {}

  private async ensureReviewSuggestionTable(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS quote_agent.dictionary_candidate_review_suggestions (
        id bigserial PRIMARY KEY,
        candidate_type varchar(30) NOT NULL,
        candidate_id bigint NOT NULL,
        recommended_action varchar(50) NOT NULL,
        confidence numeric(4,3),
        suggestion jsonb NOT NULL,
        prompt text NOT NULL,
        model varchar(100) NOT NULL,
        raw_response jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT dictionary_candidate_review_suggestions_unique
          UNIQUE (candidate_type, candidate_id, model)
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_dictionary_candidate_review_suggestions_candidate
      ON quote_agent.dictionary_candidate_review_suggestions (candidate_type, candidate_id)
    `);
  }

  async getCachedBatchReviewSuggestions(params: {
    termTypeCandidateIds?: string[];
    valueCandidateIds?: string[];
    model?: string;
  }) {
    await this.ensureReviewSuggestionTable();
    const model = getLocalModelName(params.model);
    const termTypeCandidateIds = params.termTypeCandidateIds ?? [];
    const valueCandidateIds = params.valueCandidateIds ?? [];
    const result = {
      termTypeCandidateSuggestions: [] as unknown[],
      valueCandidateSuggestions: [] as unknown[],
    };

    if (termTypeCandidateIds.length > 0) {
      const rows = await this.dataSource
        .getRepository(DictionaryCandidateReviewSuggestion)
        .createQueryBuilder("suggestion")
        .where("suggestion.candidateType = :candidateType", {
          candidateType: "term_type",
        })
        .andWhere("suggestion.model = :model", { model })
        .andWhere("suggestion.candidateId IN (:...candidateIds)", {
          candidateIds: termTypeCandidateIds,
        })
        .getMany();
      result.termTypeCandidateSuggestions = rows.map((row) => row.suggestion);
    }

    if (valueCandidateIds.length > 0) {
      const rows = await this.dataSource
        .getRepository(DictionaryCandidateReviewSuggestion)
        .createQueryBuilder("suggestion")
        .where("suggestion.candidateType = :candidateType", {
          candidateType: "value",
        })
        .andWhere("suggestion.model = :model", { model })
        .andWhere("suggestion.candidateId IN (:...candidateIds)", {
          candidateIds: valueCandidateIds,
        })
        .getMany();
      result.valueCandidateSuggestions = rows.map((row) => row.suggestion);
    }

    return result;
  }

  async suggestBatchCandidateReviews(params: {
    status?: string;
    termTypeCandidateIds?: string[];
    valueCandidateIds?: string[];
    model?: string;
    force?: boolean;
  }) {
    await this.ensureReviewSuggestionTable();
    const model = getLocalModelName(params.model);
    const termTypeCandidateRepo = this.dataSource.getRepository(
      DictionaryTermTypeCandidate
    );
    const valueCandidateRepo =
      this.dataSource.getRepository(DictionaryCandidate);
    const suggestionRepo = this.dataSource.getRepository(
      DictionaryCandidateReviewSuggestion
    );

    const termTypeWhere: any = Array.isArray(params.termTypeCandidateIds)
      ? params.termTypeCandidateIds
      : params.status ?? "pending";
    const valueWhere: any = Array.isArray(params.valueCandidateIds)
      ? params.valueCandidateIds
      : params.status ?? "pending";
    const [allTermTypeCandidates, allValueCandidates] = await Promise.all([
      Array.isArray(termTypeWhere)
        ? termTypeWhere.length === 0
          ? Promise.resolve([])
          : termTypeCandidateRepo
            .createQueryBuilder("candidate")
            .where("candidate.id IN (:...ids)", { ids: termTypeWhere })
            .orderBy("candidate.created_at", "DESC")
            .getMany()
        : termTypeCandidateRepo.find({
            where: { status: termTypeWhere },
            order: { createdAt: "DESC" },
          }),
      Array.isArray(valueWhere)
        ? valueWhere.length === 0
          ? Promise.resolve([])
          : valueCandidateRepo
            .createQueryBuilder("candidate")
            .where("candidate.id IN (:...ids)", { ids: valueWhere })
            .orderBy("candidate.created_at", "DESC")
            .getMany()
        : valueCandidateRepo.find({
            where: { status: valueWhere },
            order: { createdAt: "DESC" },
          }),
    ]);

    const existing = params.force
      ? { termTypeCandidateSuggestions: [], valueCandidateSuggestions: [] }
      : await this.getCachedBatchReviewSuggestions({
          termTypeCandidateIds: allTermTypeCandidates.map((item) => item.id),
          valueCandidateIds: allValueCandidates.map((item) => item.id),
          model,
        });
    const existingTermTypeIds = new Set(
      existing.termTypeCandidateSuggestions.map((item: any) =>
        String(item.candidateId)
      )
    );
    const existingValueIds = new Set(
      existing.valueCandidateSuggestions.map((item: any) =>
        String(item.candidateId)
      )
    );
    const termTypeCandidates = allTermTypeCandidates.filter(
      (item) => !existingTermTypeIds.has(String(item.id))
    );
    const valueCandidates = allValueCandidates.filter(
      (item) => !existingValueIds.has(String(item.id))
    );

    if (termTypeCandidates.length === 0 && valueCandidates.length === 0) {
      return {
        ...existing,
        generatedCount: 0,
        cachedCount:
          existing.termTypeCandidateSuggestions.length +
          existing.valueCandidateSuggestions.length,
        model,
      };
    }

    const input = await this.buildBatchReviewInput({
      termTypeCandidates,
      valueCandidates,
    });
    const prompt = JSON.stringify(input, null, 2);
    const messages = [
      { role: "system" as const, content: BATCH_REVIEW_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];
    const log = await startLlmCallLog({
      provider: "local",
      model,
      purpose: "quote_agent_candidate_batch_review_suggestion",
      input: {
        termTypeCandidateCount: termTypeCandidates.length,
        valueCandidateCount: valueCandidates.length,
        messages,
      },
    });

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 12000,
        messages,
      });
    } catch (error) {
      await finishLlmCallLog(log, { error });
      throw error;
    }

    const message = completion.choices[0]?.message as
      | (OpenAI.Chat.Completions.ChatCompletionMessage & { reasoning?: string })
      | undefined;
    const content = (message?.content || message?.reasoning || "").trim();
    if (!content) {
      await finishLlmCallLog(log, {
        output: completion,
        error: "empty content",
      });
      throw new Error(
        `Local LLM returned empty batch review suggestion (${model})`
      );
    }

    let rawResponse: any;
    try {
      rawResponse = parseSuggestionJson(content);
    } catch (error) {
      await finishLlmCallLog(log, { output: completion, error });
      throw error;
    }
    await finishLlmCallLog(log, { output: completion });

    const termTypeById = new Map(
      asArray(rawResponse?.termTypeCandidateSuggestions).map((item) => [
        String(item?.candidateId ?? ""),
        item,
      ])
    );
    const valueById = new Map(
      asArray(rawResponse?.valueCandidateSuggestions).map((item) => [
        String(item?.candidateId ?? ""),
        item,
      ])
    );
    const termTypeSuggestions = termTypeCandidates.map((candidate) =>
      normalizeTermTypeReviewSuggestion(
        termTypeById.get(candidate.id),
        candidate.id
      )
    );
    const valueSuggestions = valueCandidates.map((candidate) =>
      normalizeValueReviewSuggestion(valueById.get(candidate.id), candidate.id)
    );

    for (const suggestion of termTypeSuggestions) {
      await suggestionRepo.upsert(
        {
          candidateType: "term_type",
          candidateId: suggestion.candidateId,
          recommendedAction: suggestion.recommendedAction,
          confidence: confidenceToDb(suggestion.confidence),
          suggestion,
          prompt: `${BATCH_REVIEW_SYSTEM_PROMPT}\n\n${prompt}`,
          model,
          rawResponse,
        } as any,
        ["candidateType", "candidateId", "model"]
      );
    }

    for (const suggestion of valueSuggestions) {
      await suggestionRepo.upsert(
        {
          candidateType: "value",
          candidateId: suggestion.candidateId,
          recommendedAction: suggestion.recommendedAction,
          confidence: confidenceToDb(suggestion.confidence),
          suggestion,
          prompt: `${BATCH_REVIEW_SYSTEM_PROMPT}\n\n${prompt}`,
          model,
          rawResponse,
        } as any,
        ["candidateType", "candidateId", "model"]
      );
    }

    return {
      termTypeCandidateSuggestions: [
        ...existing.termTypeCandidateSuggestions,
        ...termTypeSuggestions,
      ],
      valueCandidateSuggestions: [
        ...existing.valueCandidateSuggestions,
        ...valueSuggestions,
      ],
      generatedCount: termTypeSuggestions.length + valueSuggestions.length,
      cachedCount:
        existing.termTypeCandidateSuggestions.length +
        existing.valueCandidateSuggestions.length,
      model,
    };
  }

  private async buildBatchReviewInput(params: {
    termTypeCandidates: DictionaryTermTypeCandidate[];
    valueCandidates: DictionaryCandidate[];
  }) {
    const termTypeRepo = this.dataSource.getRepository(DictionaryTermType);
    const termTypeAliasRepo = this.dataSource.getRepository(
      DictionaryTermTypeAlias
    );
    const termRepo = this.dataSource.getRepository(DictionaryTerm);
    const aliasRepo = this.dataSource.getRepository(DictionaryAlias);
    const termTypes = await termTypeRepo.find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });
    const [termTypeAliases, terms, valueAliases] = await Promise.all([
      termTypeAliasRepo.find({ where: { isActive: true } }),
      termRepo.find({ where: { isActive: true } }),
      aliasRepo.find({ where: { isActive: true } }),
    ]);
    const aliasesByTermType = new Map<string, string[]>();
    for (const alias of termTypeAliases) {
      const list = aliasesByTermType.get(alias.termType) ?? [];
      list.push(alias.aliasName);
      aliasesByTermType.set(alias.termType, list);
    }
    const enumTermTypes = new Set(
      termTypes
        .filter((termType) => termType.valueKind === "enum" || termType.valueKind === "enums")
        .map((termType) => termType.termType)
    );
    const candidateEnumTermTypes = new Set(
      [
        ...params.valueCandidates.map((candidate) => candidate.termType),
        ...params.termTypeCandidates
          .map((candidate) => candidate.proposedTermType)
          .filter((termType): termType is string => Boolean(termType)),
      ].filter((termType) => enumTermTypes.has(termType))
    );
    const valueAliasesByTermId = new Map<string, string[]>();
    for (const alias of valueAliases) {
      const list = valueAliasesByTermId.get(alias.termId) ?? [];
      list.push(alias.aliasValue);
      valueAliasesByTermId.set(alias.termId, list);
    }
    const termTypeMap = new Map(
      termTypes.map((termType) => [termType.termType, termType])
    );
    const productTypes = terms
      .filter((term) => term.termType === "product_type")
      .map((term) => ({
        canonicalValue: term.canonicalValue,
        displayName: term.displayName ?? term.canonicalValue,
      }));
    const itemNameMap = await this.buildCandidateItemNameMap([
      ...params.termTypeCandidates,
      ...params.valueCandidates,
    ]);

    return {
      productTypes,
      termTypes: termTypes.map((item) => ({
        termType: item.termType,
        displayName: item.displayName,
        quoteDisplayName: item.quoteDisplayName,
        category: item.category,
        valueKind: item.valueKind,
        applicableProductTypes: item.applicableProductTypes ?? [],
        aliases: (aliasesByTermType.get(item.termType) ?? []).slice(0, 12),
      })),
      enumValues: terms
        .filter((term) => candidateEnumTermTypes.has(term.termType))
        .map((term) => ({
          termType: term.termType,
          termId: term.id,
          canonicalValue: term.canonicalValue,
          displayName: term.displayName,
          aliases: (valueAliasesByTermId.get(term.id) ?? []).slice(0, 12),
        })),
      termTypeCandidates: params.termTypeCandidates.map((candidate) => ({
        candidateId: candidate.id,
        rawFieldName: candidate.rawFieldName,
        normalizedFieldName: candidate.normalizedFieldName,
        rawValue: candidate.rawValue,
        sourceProductType: candidate.sourceProductType ?? "unknown",
        itemIndex: candidate.itemIndex,
        itemName: itemNameMap.get(this.itemNameKey(candidate)) ?? null,
        proposedTermType: candidate.proposedTermType,
        proposedTermTypeDisplayName:
          candidate.proposedTermType !== null
            ? termTypeMap.get(candidate.proposedTermType)?.displayName ?? null
            : null,
        proposedTermTypeApplicableProductTypes:
          candidate.proposedTermType !== null
            ? termTypeMap.get(candidate.proposedTermType)?.applicableProductTypes ?? []
            : [],
        reason: candidate.reason,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
      })),
      valueCandidates: params.valueCandidates.map((candidate) => ({
        candidateId: candidate.id,
        termType: candidate.termType,
        termTypeDisplayName:
          termTypes.find((item) => item.termType === candidate.termType)
            ?.displayName ?? null,
        valueKind:
          termTypeMap.get(candidate.termType)?.valueKind ?? "enum",
        applicableProductTypes:
          termTypeMap.get(candidate.termType)?.applicableProductTypes ?? [],
        rawValue: candidate.rawValue,
        sourceProductType: candidate.sourceProductType ?? "unknown",
        itemIndex: candidate.itemIndex,
        itemName: itemNameMap.get(this.itemNameKey(candidate)) ?? null,
        proposedCanonicalValue: candidate.proposedCanonicalValue,
        proposedTermId: candidate.proposedTermId,
        reason: candidate.reason,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
      })),
    };
  }

  private itemNameKey(candidate: {
    extractionResultId?: string | null;
    itemIndex?: number | null;
  }): string {
    return `${candidate.extractionResultId ?? ""}:${candidate.itemIndex ?? ""}`;
  }

  private async buildCandidateItemNameMap(
    candidates: Array<{
      extractionResultId?: string | null;
      itemIndex?: number | null;
    }>
  ): Promise<Map<string, string>> {
    const extractionResultIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.extractionResultId)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (extractionResultIds.length === 0) {
      return new Map();
    }

    const rows = await this.dataSource.getRepository(ExtractionResults).find({
      where: { id: In(extractionResultIds.map((id) => Number(id))) },
    });
    const result = new Map<string, string>();
    for (const row of rows) {
      const source =
        (row.normalizedExtractionJson as any)?.items ??
        (row.extractionJson as any)?.items ??
        (row.extractionJson as any)?.extraction?.items ??
        [];
      if (!Array.isArray(source)) continue;
      for (const item of source) {
        const itemIndex = item?.item_index ?? item?.itemIndex;
        const rawItemName = item?.item_name ?? item?.itemName;
        const itemName =
          typeof rawItemName === "string"
            ? rawItemName
            : typeof rawItemName?.value === "string"
              ? rawItemName.value
              : "";
        if (itemIndex !== undefined && itemIndex !== null && itemName) {
          result.set(`${row.id}:${itemIndex}`, itemName);
        }
      }
    }
    return result;
  }

  async suggestTermTypeFromCandidate(params: {
    candidateId: string;
    model?: string;
    force?: boolean;
  }): Promise<DictionaryTermTypeSuggestion> {
    const candidateRepo = this.dataSource.getRepository(
      DictionaryTermTypeCandidate
    );
    const suggestionRepo = this.dataSource.getRepository(
      DictionaryTermTypeSuggestion
    );
    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(
        `DictionaryTermTypeCandidate not found: ${params.candidateId}`
      );
    }

    const model = getLocalModelName(params.model);
    const normalizedFieldName = normalizeText(candidate.rawFieldName);
    const existing = await suggestionRepo.findOne({
      where: { normalizedFieldName, model },
    });
    if (
      existing &&
      (!params.force || (existing.suggestedAliases ?? []).length > 0)
    ) {
      return existing;
    }

    const prompt = buildPrompt({
      rawFieldName: candidate.rawFieldName,
      rawValue: candidate.rawValue,
    });
    const messages = [
      { role: "system" as const, content: SUGGEST_TERM_TYPE_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];
    const log = await startLlmCallLog({
      provider: "local",
      model,
      purpose: "quote_agent_term_type_suggestion",
      input: {
        candidateId: candidate.id,
        rawFieldName: candidate.rawFieldName,
        rawValue: candidate.rawValue,
        messages,
      },
    });
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 1200,
        messages,
      });
    } catch (error) {
      await finishLlmCallLog(log, { error });
      throw error;
    }
    const message = completion.choices[0]?.message as
      | (OpenAI.Chat.Completions.ChatCompletionMessage & { reasoning?: string })
      | undefined;
    const content = (message?.content || message?.reasoning || "").trim();
    if (!content) {
      await finishLlmCallLog(log, {
        output: completion,
        error: "empty content",
      });
      throw new Error(`Local LLM returned empty suggestion (${model})`);
    }

    let rawResponse: any;
    try {
      rawResponse = parseSuggestionJson(content);
    } catch (error) {
      await finishLlmCallLog(log, { output: completion, error });
      throw error;
    }
    await finishLlmCallLog(log, { output: completion });
    const fallbackTermType = `field_${candidate.id}`;
    const suggestion = suggestionRepo.create({
      candidateId: candidate.id,
      rawFieldName: candidate.rawFieldName,
      normalizedFieldName,
      suggestedTermType: sanitizeTermType(
        rawResponse.termType,
        fallbackTermType
      ),
      suggestedDisplayName:
        String(rawResponse.displayName ?? "").trim() || candidate.rawFieldName,
      suggestedAliases: uniqueAliases(
        Array.isArray(rawResponse.aliases) ? rawResponse.aliases : [],
        candidate.rawFieldName
      ),
      prompt: `${SUGGEST_TERM_TYPE_SYSTEM_PROMPT}\n\n${prompt}`,
      model,
      rawResponse,
    });

    await suggestionRepo.upsert(
      suggestion as unknown as Parameters<typeof suggestionRepo.upsert>[0],
      ["normalizedFieldName", "model"]
    );

    const saved = await suggestionRepo.findOne({
      where: { normalizedFieldName, model },
    });
    if (!saved) {
      throw new Error(
        "Term type suggestion upsert succeeded but row was not found"
      );
    }

    return saved;
  }

  async suggestValueSplitFromCandidate(params: {
    candidateId: string;
    model?: string;
    force?: boolean;
  }): Promise<DictionaryValueSplitSuggestion> {
    const candidateRepo = this.dataSource.getRepository(DictionaryCandidate);
    const suggestionRepo = this.dataSource.getRepository(
      DictionaryValueSplitSuggestion
    );
    const termTypeRepo = this.dataSource.getRepository(DictionaryTermType);
    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
    }

    const model = getLocalModelName(params.model);
    const existing = await suggestionRepo.findOne({
      where: { candidateId: candidate.id, model },
    });
    if (
      existing &&
      (!params.force || (existing.suggestions ?? []).length > 0)
    ) {
      return existing;
    }

    const termTypes = await termTypeRepo.find({
      where: { isActive: true },
      order: { sortOrder: "ASC" },
    });
    const prompt = buildValueSplitPrompt({
      termType: candidate.termType,
      rawValue: candidate.rawValue,
      termTypes,
    });
    const messages = [
      { role: "system" as const, content: SUGGEST_TERM_TYPE_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];
    const log = await startLlmCallLog({
      provider: "local",
      model,
      purpose: "quote_agent_value_split_suggestion",
      input: {
        candidateId: candidate.id,
        termType: candidate.termType,
        rawValue: candidate.rawValue,
        messages,
      },
    });
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 1600,
        messages,
      });
    } catch (error) {
      await finishLlmCallLog(log, { error });
      throw error;
    }
    const message = completion.choices[0]?.message as
      | (OpenAI.Chat.Completions.ChatCompletionMessage & { reasoning?: string })
      | undefined;
    const content = (message?.content || message?.reasoning || "").trim();
    if (!content) {
      await finishLlmCallLog(log, {
        output: completion,
        error: "empty content",
      });
      throw new Error(`Local LLM returned empty split suggestion (${model})`);
    }

    let rawResponse: any;
    try {
      rawResponse = parseSuggestionJson(content);
    } catch (error) {
      await finishLlmCallLog(log, { output: completion, error });
      throw error;
    }
    await finishLlmCallLog(log, { output: completion });

    const suggestion = suggestionRepo.create({
      candidateId: candidate.id,
      termType: candidate.termType,
      rawValue: candidate.rawValue,
      suggestions: normalizeSplitSuggestions(rawResponse),
      prompt: `${SUGGEST_TERM_TYPE_SYSTEM_PROMPT}\n\n${prompt}`,
      model,
      rawResponse,
    });

    await suggestionRepo.upsert(
      suggestion as unknown as Parameters<typeof suggestionRepo.upsert>[0],
      ["candidateId", "model"]
    );

    const saved = await suggestionRepo.findOne({
      where: { candidateId: candidate.id, model },
    });
    if (!saved) {
      throw new Error(
        "Value split suggestion upsert succeeded but row was not found"
      );
    }

    return saved;
  }
}
