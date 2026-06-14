import { Brackets, DataSource, In, SelectQueryBuilder } from "typeorm";
import OpenAI from "openai";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  DictionaryCandidateReviewSuggestion,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryTermTypeCandidate,
  DictionaryTermTypeSuggestion,
  DictionaryValueSplitSuggestion,
} from "./entity/index.js";
import { Documents } from "../workflow/entity/documents.entity.js";
import { buildExtractionItemNameMap } from "../extractionItemNames.js";
import { normalizeText } from "./dictionary.utils.js";
import {
  asArray,
  buildPrompt,
  buildValueSplitPrompt,
  CandidateClusterBuildParams,
  CandidateClusterInput,
  clusterId,
  clusterKey,
  clusterLabel,
  ClusterBatchReviewRunPolicy,
  confidenceToDb,
  normalizeClusterReviewSuggestion,
  normalizeSplitSuggestions,
  normalizeTermTypeReviewSuggestion,
  normalizeValueReviewSuggestion,
  parseSuggestionJson,
  readableClusterId,
  sanitizeTermType,
  textFromEvidence,
  uniqueAliases,
  uniqueLimited,
} from "./dictionarySuggestion.helpers.js";
import { getLocalModelClient, getLocalModelName } from "../../../llm/index.js";
import { finishLlmCallLog, startLlmCallLog } from "../../../llm/index.js";

type ParsedTermTypeClusterId = {
  candidateType: "term_type";
  normalizedFieldName: string;
  sourceProductType: string;
  reason: string | null;
};

type ParsedValueClusterId = {
  candidateType: "value";
  termType: string;
  normalizedRawValue: string;
  sourceProductType: string;
  reason: string | null;
};

type ParsedCandidateClusterId =
  | ParsedTermTypeClusterId
  | ParsedValueClusterId;

const SUGGEST_TERM_TYPE_SYSTEM_PROMPT =
  "只输出最终 JSON。不要解释，不要推理，不要 Markdown。JSON 必须包含 termType, displayName, aliases。";

export const CLUSTER_BATCH_REVIEW_SYSTEM_PROMPT = `你是 productConfigAgent 字典候选“簇级批量治理”助手。

只输出合法 JSON。不要 Markdown，不要解释，不要代码块。输出必须能被 JSON.parse 解析。

你的任务不是按 document 审核，而是按 candidateCluster 审核。一个 candidateCluster 代表大量文件里重复出现的同类候选，例如：
plastic_material: PVC自由发泡板
出现 138 次，涉及 92 个 document
常见上下文：PVC自由发泡板模头
AI 建议：不要把“PVC自由发泡板”整体做成 plastic_material；应拆成 plastic_material=PVC + application_type=自由发泡板。

输入包含：

- productTypes：正式产品类型字典，来自 term_type=product_type。
- termTypes：现有字段 Key，含 termType、displayName、valueKind、category、aliases、applicableProductTypes。
- enumValues：候选相关 enum/enums 字段下已有标准值摘要。
- candidateClusters：候选簇列表。每个簇包含 clusterId、candidateType、candidateIds、聚类 key、出现次数、涉及 document 数、常见 rawFieldName/rawValue、常见上下文、样例 occurrence。
- priorDecisions：历史已确认的簇级治理结果。可用于增量重跑时保持一致。
- runPolicy：本次运行策略，例如 confidenceThreshold、maxSuggestedAliases、allowSplitValue。

总体原则：

1. 你必须按 clusterId 输出建议，不要逐 document 输出。
2. 不要遗漏任何 clusterId。
3. 同一个簇内多个 candidateIds 应得到同一个治理建议，除非簇内样例明显混杂；混杂时返回 needs_human_review。
4. 对高频簇优先给出可执行建议，但不能牺牲准确性。
5. 不确定、证据冲突、产品类型错配、可能影响报价但无法判断时，返回 needs_human_review。
6. 如果 priorDecisions 中已有相同 clusterKey 且现有字典仍兼容，应优先沿用历史决策，并在 reason 中说明“沿用历史簇决策”。
7. sourceProductType 只作为上下文，不是字段 Key，不要创建 product_type_hint / item_type_hint。
8. applicableProductTypes 只能使用 productTypes 中的 canonicalValue，或 common。
9. 如果目标 termType 的 applicableProductTypes 不包含 sourceProductType，也不包含 common，不要直接高置信 approve；应 needs_human_review，或建议追加 applicableProductTypes。
10. 不要把具体型号、规格、压力、排量、尺寸、客户备注做成 enum value。
11. 只有 valueKind=enum/enums 的字段值才需要 dictionary value alias。
12. number、number_unit、boolean、text、date、number_or_boolean 字段值通常不应 create_value 或 approve_as_alias。
13. 如果 candidateType=value 且 rawValue 包含多个业务含义，优先 split_value，而不是把复合短语整体塞进一个字段。
14. 严格区分 candidateType：
   - candidateType=term_type 时，审核对象是 rawFieldName / normalizedFieldName，只能判断字段 Key 是否应创建、作为已有字段别名、拆成多个字段 Key、拒绝或转人工；不要把 rawValue 当成字段值候选来迁移。
   - candidateType=value 时，审核对象才是 rawValue / normalizedRawValue，才允许 move_to_other_term_type 或 split_value。
15. 如果 rawValue 语义明显不属于当前 termType，只能在 candidateType=value 时返回 move_to_other_term_type；candidateType=term_type 时应返回 approve_as_alias、create_term_type 或 needs_human_review。
16. 如果 rawFieldName 应归属已有字段 Key，返回 approve_as_alias。
17. 如果确实是新的稳定字段 Key，返回 create_term_type。
18. 如果 rawFieldName 本身是复合字段名，例如“电压及加热功率”“长宽高”“压力及排量”，应返回 split_term_type，并在 splits 中给出拆分后的字段 Key 和对应值；不要返回 split_value。
19. 只有 rawFieldName 本身明确包含多个并列参数/字段时才返回 split_term_type。不要因为 rawValue 包含多个勾选项、多个 enum 值、多个配置部件，就把 term_type 拆成多个字段。
20. “xxx配置 / xxx组成 / xxx选项 / xxx包含 / xxx配置项 / xxx系统配置”通常是一个多选集合字段。candidateType=term_type 时应优先 create_term_type，suggestedValueKind 使用 enums；如果已有合适字段则 approve_as_alias。例：“传动系统配置” rawValue 为“万向传动轴 / 减速箱”，应建一个 transmission_system_config/drive_system_config 字段，valueKind=enums，不要拆成 drive_shaft_config 和 reducer_config。
21. “xxx备注 / xxx说明 / 特殊说明 / 特殊要求 / 客户备注 / 备注”是说明性 text 字段，不是无效字段。candidateType=term_type 时，如果已有 remark/note/special_requirement 等备注类字段，应 approve_as_alias；否则 create_term_type，suggestedValueKind 使用 text；证据不足时 needs_human_review。不要仅因为它“不应作为正式 termType”而 reject。
22. 如果 reason 或 humanReviewSummary 表达“应归入 option / 备注字段 / 说明字段 / text 字段”，recommendedAction 不应为 reject；应选择 approve_as_alias、create_term_type 或 needs_human_review。
23. reject 仅用于解析噪声、空字段、明显不是业务字段且没有可归属字段的候选。不要把需要保留到 option、备注、说明、text 字段的信息 reject。

产品类型规则：

- flat_die：平模头
- filter：过滤器 / 换网器
- metering_pump：计量泵
- feedblock：分配器
- die_cart：模具小车
- hydraulic_station：液压站
- melt_pipe：熔体管道 / 连接器 / 联结器 / 联接器
- blown_film_die：吹膜模头 / 圆模
- coating_die：涂布模头
- unknown：未知

领域规则：

1. 过滤器 / 换网器
- product_type=filter 只表示一级产品类型。
- 双柱换网器、高压过滤器、液压换网器、连续换网器、板式换网器、柱塞式换网器等不应作为 product_type 的普通 enum value。
- 这些应优先归入 filter_structure_type / filter_drive_method 等二级字段。
- 例如“双柱液压换网器”应考虑 split_value：filter_structure_type=双柱换网器，filter_drive_method=液压。

2. 计量泵
- 具体型号不应做 enum。
- 排量、压差、出口压力应为 number_unit。
- 10ccm、25MPa、37MPa 等不应 create_value。

3. 液压站
- 具体型号不应做 enum。
- 功率、压力、油箱容量应为 number_unit。
- “液压”不要单独错误归入 product_type。

4. 材料与应用拆分
- 如果 rawValue 把材料和应用/工艺混在一起，例如“PVC自由发泡板”“PP流延膜”“PET片材”，不要整体作为 plastic_material。
- 应优先 split_value：
  - plastic_material = PVC / PP / PET 等材料
  - application_type 或 product_application = 自由发泡板 / 流延膜 / 片材 等应用
- 如果缺少合适的 application termType，建议 create_term_type，而不是把复合值整体 approve。

输出 JSON 格式：

{
  "clusterSuggestions": [
    {
      "clusterId": "string",
      "candidateType": "term_type | value",
      "candidateIds": ["string"],
      "recommendedAction": "create_term_type | approve_as_alias | split_term_type | create_value | move_to_other_term_type | split_value | reject | needs_human_review",
      "confidence": 0.0,
      "riskLevel": "low | medium | high",
      "reason": "string",
      "humanReviewSummary": "给人工审核者看的简短中文结论",

      "sourceProductType": "string|null",
      "occurrenceCount": 0,
      "documentCount": 0,

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

      "canonicalValue": "string|null",
      "displayName": "string|null",
      "suggestedAliases": ["string"],

      "targetTermId": "string|null",
      "targetCanonicalValue": "string|null",
      "targetDisplayName": "string|null",

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
      ],

      "batchOperationsPreview": [
        {
          "candidateType": "term_type|value",
          "candidateId": "string",
          "action": "string",
          "payload": {}
        }
      ]
    }
  ]
}

强制要求：

- 每个输入 clusterId 必须输出一个 clusterSuggestion。
- candidateIds 必须原样带回。
- recommendedAction 必须与 candidateType 兼容：
  - term_type 只允许 create_term_type、approve_as_alias、split_term_type、reject、needs_human_review。
  - value 只允许 create_value、approve_as_alias、move_to_other_term_type、split_value、reject、needs_human_review。
- candidateType=term_type 时，禁止输出 move_to_other_term_type、split_value、create_value，也禁止在 batchOperationsPreview 中输出 move_value_to_other_term_type、split_value、create_value、approve_value_as_alias。
- candidateType=value 时，禁止输出 create_term_type、approve_term_type_as_alias。
- batchOperationsPreview 中每个 operation 的 candidateType 必须等于当前 cluster 的 candidateType，candidateId 必须来自当前 cluster.candidateIds。
- approve_as_alias：
  - term_type 必须填写 targetTermType、targetTermTypeDisplayName、suggestedAliases。
  - value 必须填写 targetTermId、targetCanonicalValue、targetDisplayName、suggestedAliases。
- create_term_type 必须填写 suggestedTermType、suggestedDisplayName、suggestedValueKind、suggestedApplicableProductTypes、suggestedDescription、suggestedCategory。
- create_value 只允许用于 enum/enums 字段，必须填写 canonicalValue、displayName、suggestedAliases。
- move_to_other_term_type 必须填写 targetTermType、targetTermTypeDisplayName、movedRawValue。
- split_term_type 必须填写非空 splits，batchOperationsPreview action 使用 split_term_type。
- split_value 必须填写非空 splits。
- reject 必须说明为什么不是有效候选。
- needs_human_review 必须说明不确定点。
- targetTermTypeApplicableMismatch 默认 false。
- 没有建议的数组字段输出空数组，不要省略。
- 如果无法满足某个 action 的必填字段，必须返回 needs_human_review。
- batchOperationsPreview 只生成“人确认后可提交”的预览，不代表你可以自动审批。`;

const BATCH_REVIEW_SYSTEM_PROMPT = `你是 productConfigAgent 字典候选批量预审助手。

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
   * 如果 rawFieldName 本身是复合字段名，例如“电压及加热功率”“长宽高”“压力及排量”，应返回 split_term_type，并在 splits 中给出拆分后的字段 Key 和对应值；不要返回 split_value。
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
"recommendedAction": "create_term_type | approve_as_alias | split_term_type | reject | needs_human_review",
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
  ],

  "splits": [
    {
      "termType": "string",
      "displayName": "string|null",
      "valueKind": "enum|enums|number|number_unit|text|boolean|date|number_or_boolean|null",
      "rawValue": "string|null",
      "canonicalValue": "string|null",
      "aliasNames": ["string"],
      "valueAliasNames": ["string"],
      "applicableProductTypes": ["string"]
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
  * split_term_type：splits 必须非空；每个 split 必须包含 termType 和 rawValue/canonicalValue/displayName 之一。
  * split_term_type：每个 split 的 applicableProductTypes 应优先包含 sourceProductType，通用字段使用 ["common"]。
  * reject：reason 必须说明为什么不是有效字段 Key。
  * needs_human_review：reason 必须说明不确定点。
  * suggestedValues 只能在 create_term_type 且 suggestedValueKind=enum/enums 时填写，否则必须为空数组。
  * splits 只能在 split_term_type 时填写，否则必须为空数组。
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


export class DictionarySuggestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly client: OpenAI = getLocalModelClient()
  ) {}

  getClusterBatchReviewPrompt() {
    const inputTemplate = {
      productTypes: "{{productTypes}}",
      termTypes: "{{termTypes}}",
      enumValues: "{{enumValues}}",
      candidateClusters: "{{candidateClusters}}",
      priorDecisions: "{{priorDecisions}}",
      runPolicy: {
        confidenceThreshold: 0.85,
        maxSuggestedAliases: 10,
        allowSplitValue: true,
      },
    };
    const outputShape = {
      suggestions: [
        {
          clusterId: "string",
          recommendedAction:
            "create_term_type | approve_as_alias | split_term_type | create_value | move_to_other_term_type | split_value | reject | needs_human_review",
          confidence: 0,
          riskLevel: "low | medium | high",
          needsHumanReview: false,
          humanReviewSummary: "string",
          reason: "string",
          batchOperationsPreview: [
            {
              candidateType: "term_type|value",
              candidateId: "string",
              action:
                "create_term_type | approve_term_type_as_alias | split_term_type | create_value | approve_value_as_alias | split_value | move_value_to_other_term_type | update_term_type_value_kind | reject",
              payload: {},
            },
          ],
        },
      ],
    };
    const promptTemplate = [
      CLUSTER_BATCH_REVIEW_SYSTEM_PROMPT,
      "",
      "Review only the candidateClusters in the input JSON. Do not add or infer clusterIds that are not present.",
      "Return valid JSON only. The top-level shape must be {\"suggestions\": [...]}.",
      "Every suggestion must include clusterId, recommendedAction, confidence, riskLevel, needsHumanReview, humanReviewSummary, reason, and batchOperationsPreview.",
      "batchOperationsPreview must be an operations preview that can be submitted to /productConfigAgent/candidates/reviews/batch; action must use the action names accepted by that endpoint.",
      "",
      "Input JSON:",
      JSON.stringify(inputTemplate, null, 2),
      "",
      "Output JSON shape:",
      JSON.stringify(outputShape, null, 2),
    ].join("\n");

    return {
      prompt: promptTemplate,
      promptTemplate,
      placeholders: {
        productTypes:
          "Replace with options.productTypes or productTypes from /productConfigAgent/candidates/clusters.",
        termTypes:
          "Replace with options.termTypes or termTypes from /productConfigAgent/candidates/clusters.",
        enumValues:
          "Replace with options.enumValues or enumValues from /productConfigAgent/candidates/clusters.",
        candidateClusters: "Replace with the currently selected candidateClusters array.",
        priorDecisions: "Use [] when there are no prior decisions.",
      },
      systemPrompt: CLUSTER_BATCH_REVIEW_SYSTEM_PROMPT,
      inputShape: {
        productTypes: "Official product type dictionary.",
        termTypes: "Existing dictionary field keys.",
        enumValues: "Relevant enum/enums standard value summaries.",
        candidateClusters: "Candidate clusters selected for review.",
        priorDecisions: "Previously confirmed cluster-level decisions, or [].",
        runPolicy: inputTemplate.runPolicy,
      },
      outputShape,
    };
  }

  async buildClusterBatchReviewInput(params: CandidateClusterBuildParams = {}) {
    const { termTypeCandidates, valueCandidates } =
      await this.findCandidatesForClusterReview(params);
    const baseInput = await this.buildBatchReviewInput({
      termTypeCandidates,
      valueCandidates,
    });
    const allCandidateClusters = await this.buildCandidateClusters({
      termTypeCandidates,
      valueCandidates,
      documentId: params.documentId,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const resultLimit = Math.max(
      1,
      Math.floor(params.limit ?? params.clusterIds?.length ?? 200),
    );
    const candidateClusters = allCandidateClusters.slice(0, resultLimit);

    return {
      productTypes: baseInput.productTypes,
      termTypes: baseInput.termTypes,
      enumValues: baseInput.enumValues,
      candidateClusters,
      clusterSummary: {
        totalClusterCount: allCandidateClusters.length,
        totalTermTypeClusterCount: allCandidateClusters.filter(
          (cluster) => cluster.candidateType === "term_type",
        ).length,
        totalValueClusterCount: allCandidateClusters.filter(
          (cluster) => cluster.candidateType === "value",
        ).length,
        returnedClusterCount: candidateClusters.length,
      },
      priorDecisions: [] as unknown[],
      runPolicy: {
        confidenceThreshold: 0.85,
        maxSuggestedAliases: 10,
        allowSplitValue: true,
      } as ClusterBatchReviewRunPolicy,
    };
  }

  async suggestBatchCandidateClusterReviews(params: CandidateClusterBuildParams & {
    model?: string;
    priorDecisions?: unknown[];
    runPolicy?: Partial<ClusterBatchReviewRunPolicy>;
  }) {
    if (!Array.isArray(params.clusterIds) || params.clusterIds.length === 0) {
      throw new Error("clusterIds is required");
    }
    if (params.clusterIds.length > 100) {
      throw new Error("clusterIds length must be <= 100");
    }
    const model = getLocalModelName(params.model);
    const input = await this.buildClusterBatchReviewInput(params);
    input.priorDecisions = asArray(params.priorDecisions);
    input.runPolicy = {
      ...input.runPolicy,
      ...(params.runPolicy ?? {}),
    };

    if (input.candidateClusters.length === 0) {
      return {
        suggestions: [],
      };
    }

    const prompt = JSON.stringify(input, null, 2);
    const messages = [
      { role: "system" as const, content: CLUSTER_BATCH_REVIEW_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];
    const log = await startLlmCallLog({
      provider: "local",
      model,
      purpose: "product_config_agent_candidate_cluster_batch_review_suggestion",
      input: {
        clusterCount: input.candidateClusters.length,
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
        `Local LLM returned empty cluster batch review suggestion (${model})`,
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

    const suggestionsByClusterId = new Map(
      asArray(rawResponse?.suggestions ?? rawResponse?.clusterSuggestions).map((item) => [
        String(item?.clusterId ?? ""),
        item,
      ]),
    );
    const suggestions = input.candidateClusters.map((cluster) =>
      this.toPublicClusterSuggestion(
        normalizeClusterReviewSuggestion(
          suggestionsByClusterId.get(cluster.clusterId),
          cluster,
        ),
      ),
    );

    return {
      suggestions,
    };
  }

  private toPublicClusterSuggestion(suggestion: any) {
    return {
      clusterId: suggestion.clusterId,
      recommendedAction: suggestion.recommendedAction,
      confidence: suggestion.confidence,
      riskLevel: suggestion.riskLevel,
      needsHumanReview: suggestion.needsHumanReview,
      humanReviewSummary: suggestion.humanReviewSummary,
      reason: suggestion.reason,
      batchOperationsPreview: suggestion.batchOperationsPreview,
    };
  }

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
      purpose: "product_config_agent_candidate_batch_review_suggestion",
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

  private async findCandidatesForClusterReview(
    params: CandidateClusterBuildParams,
  ) {
    const status = params.status ?? "pending";
    const candidateType = params.candidateType ?? "all";
    const requestedClusters = params.clusterIds?.map((id) =>
      this.parseCandidateClusterId(id),
    );
    const requestedTermTypeClusters =
      requestedClusters?.filter((cluster) => cluster.candidateType === "term_type") ??
      [];
    const requestedValueClusters =
      requestedClusters?.filter((cluster) => cluster.candidateType === "value") ??
      [];
    const termTypeCandidateRepo = this.dataSource.getRepository(
      DictionaryTermTypeCandidate,
    );
    const valueCandidateRepo =
      this.dataSource.getRepository(DictionaryCandidate);

    const termTypeQuery = termTypeCandidateRepo
      .createQueryBuilder("candidate")
      .orderBy("candidate.created_at", "DESC");
    if (candidateType === "value") {
      termTypeQuery.where("1 = 0");
    } else if (requestedClusters) {
      this.applyTermTypeClusterFilter(
        termTypeQuery,
        requestedTermTypeClusters as ParsedTermTypeClusterId[],
        status,
      );
    } else if (Array.isArray(params.termTypeCandidateIds)) {
      if (params.termTypeCandidateIds.length === 0) {
        termTypeQuery.where("1 = 0");
      } else {
        termTypeQuery.where("candidate.id IN (:...ids)", {
          ids: params.termTypeCandidateIds,
        });
      }
    } else {
      termTypeQuery.where("candidate.status = :status", { status });
    }
    if (params.documentId !== undefined) {
      termTypeQuery.andWhere("candidate.documentId = :documentId", {
        documentId: String(params.documentId),
      });
    }

    const valueQuery = valueCandidateRepo
      .createQueryBuilder("candidate")
      .orderBy("candidate.created_at", "DESC");
    if (candidateType === "term_type") {
      valueQuery.where("1 = 0");
    } else if (requestedClusters) {
      this.applyValueClusterFilter(
        valueQuery,
        requestedValueClusters as ParsedValueClusterId[],
        status,
      );
    } else if (Array.isArray(params.valueCandidateIds)) {
      if (params.valueCandidateIds.length === 0) {
        valueQuery.where("1 = 0");
      } else {
        valueQuery.where("candidate.id IN (:...ids)", {
          ids: params.valueCandidateIds,
        });
      }
    } else {
      valueQuery.where("candidate.status = :status", { status });
    }
    if (params.documentId !== undefined) {
      valueQuery.andWhere("candidate.documentId = :documentId", {
        documentId: String(params.documentId),
      });
    }

    const [termTypeCandidates, valueCandidates] = await Promise.all([
      termTypeQuery.getMany(),
      valueQuery.getMany(),
    ]);

    return { termTypeCandidates, valueCandidates };
  }

  private parseCandidateClusterId(
    clusterIdValue: string,
  ): ParsedCandidateClusterId {
    const parts = String(clusterIdValue ?? "")
      .split(":")
      .map((part) => decodeURIComponent(part));
    if (parts[0] === "term_type" && parts.length === 4) {
      return {
        candidateType: "term_type",
        normalizedFieldName: parts[1],
        sourceProductType: parts[2],
        reason: parts[3] || null,
      };
    }
    if (parts[0] === "value" && parts.length === 5) {
      return {
        candidateType: "value",
        termType: parts[1],
        normalizedRawValue: parts[2],
        sourceProductType: parts[3],
        reason: parts[4] || null,
      };
    }
    throw new Error(`invalid clusterId: ${clusterIdValue}`);
  }

  private applyTermTypeClusterFilter(
    query: SelectQueryBuilder<DictionaryTermTypeCandidate>,
    clusters: ParsedTermTypeClusterId[],
    status: string,
  ) {
    if (clusters.length === 0) {
      query.where("1 = 0");
      return;
    }
    query.where(
      new Brackets((qb) => {
        clusters.forEach((cluster, index) => {
          qb.orWhere(
            `candidate.status = :ttStatus${index}
             AND candidate.normalizedFieldName = :ttField${index}
             AND candidate.sourceProductType = :ttSource${index}
             AND ${this.reasonSql("candidate.reason", `ttReason${index}`)}`,
            {
              [`ttStatus${index}`]: status,
              [`ttField${index}`]: cluster.normalizedFieldName,
              [`ttSource${index}`]: cluster.sourceProductType,
              [`ttReason${index}`]: cluster.reason,
            },
          );
        });
      }),
    );
  }

  private applyValueClusterFilter(
    query: SelectQueryBuilder<DictionaryCandidate>,
    clusters: ParsedValueClusterId[],
    status: string,
  ) {
    if (clusters.length === 0) {
      query.where("1 = 0");
      return;
    }
    query.where(
      new Brackets((qb) => {
        clusters.forEach((cluster, index) => {
          qb.orWhere(
            `candidate.status = :valueStatus${index}
             AND candidate.termType = :valueTermType${index}
             AND candidate.normalizedRawValue = :valueRaw${index}
             AND candidate.sourceProductType = :valueSource${index}
             AND ${this.reasonSql("candidate.reason", `valueReason${index}`)}`,
            {
              [`valueStatus${index}`]: status,
              [`valueTermType${index}`]: cluster.termType,
              [`valueRaw${index}`]: cluster.normalizedRawValue,
              [`valueSource${index}`]: cluster.sourceProductType,
              [`valueReason${index}`]: cluster.reason,
            },
          );
        });
      }),
    );
  }

  private reasonSql(column: string, parameterName: string): string {
    return `(
      (${column} IS NULL AND :${parameterName} IS NULL)
      OR ${column} = :${parameterName}
    )`;
  }

  async buildCandidateClusters(params: {
    termTypeCandidates: DictionaryTermTypeCandidate[];
    valueCandidates: DictionaryCandidate[];
    documentId?: number;
    limit?: number;
  }): Promise<CandidateClusterInput[]> {
    const occurrenceRepo = this.dataSource.getRepository(
      DictionaryCandidateOccurrence,
    );
    const occurrenceQueries = await Promise.all([
      params.termTypeCandidates.length === 0
        ? Promise.resolve([])
        : occurrenceRepo.find({
            where: {
              candidateType: "term_type",
              candidateId: In(params.termTypeCandidates.map((item) => item.id)),
              ...(params.documentId
                ? { documentId: String(params.documentId) }
                : {}),
            },
            order: { createdAt: "DESC" },
          }),
      params.valueCandidates.length === 0
        ? Promise.resolve([])
        : occurrenceRepo.find({
            where: {
              candidateType: "value",
              candidateId: In(params.valueCandidates.map((item) => item.id)),
              ...(params.documentId
                ? { documentId: String(params.documentId) }
                : {}),
            },
            order: { createdAt: "DESC" },
          }),
    ]);
    const occurrences = occurrenceQueries.flat();
    const occurrencesByCandidate = new Map<string, DictionaryCandidateOccurrence[]>();
    for (const occurrence of occurrences) {
      const key = `${occurrence.candidateType}:${occurrence.candidateId}`;
      occurrencesByCandidate.set(key, [
        ...(occurrencesByCandidate.get(key) ?? []),
        occurrence,
      ]);
    }

    const documentIds = [
      ...new Set(
        [
          ...params.termTypeCandidates.map((candidate) => candidate.documentId),
          ...params.valueCandidates.map((candidate) => candidate.documentId),
          ...occurrences.map((occurrence) => occurrence.documentId),
        ]
          .filter(Boolean)
          .map((id) => Number(id)),
      ),
    ];
    const documents = documentIds.length
      ? await this.dataSource
          .getRepository(Documents)
          .find({ where: { id: In(documentIds) } })
      : [];
    const documentMap = new Map(
      documents.map((document) => [String(document.id), document]),
    );

    const itemNameMap = await this.buildCandidateItemNameMap([
      ...params.termTypeCandidates,
      ...params.valueCandidates,
      ...occurrences,
    ]);

    const clusters = new Map<
      string,
      CandidateClusterInput & {
        documentIds: Set<string>;
        contextCandidates: string[];
      }
    >();

    const ensureCluster = (data: {
      clusterKey: string;
      clusterId: string;
      readableClusterId: string;
      clusterLabel: string;
      candidateType: "term_type" | "value";
      sourceProductType: string;
      reason: string | null;
      termType?: string;
      normalizedRawValue?: string;
      normalizedFieldName?: string;
    }) => {
      const existing = clusters.get(data.clusterKey);
      if (existing) return existing;
      const created = {
        clusterId: data.clusterId,
        readableClusterId: data.readableClusterId,
        clusterLabel: data.clusterLabel,
        clusterKey: data.clusterKey,
        candidateType: data.candidateType,
        candidateIds: [],
        termType: data.termType,
        normalizedRawValue: data.normalizedRawValue,
        normalizedFieldName: data.normalizedFieldName,
        rawValueSamples: [],
        rawFieldNameSamples: [],
        normalizedFieldNameSamples: [],
        sourceProductType: data.sourceProductType,
        reason: data.reason,
        occurrenceCount: 0,
        documentCount: 0,
        commonContexts: [],
        sampleOccurrences: [],
        documentIds: new Set<string>(),
        contextCandidates: [],
      };
      clusters.set(data.clusterKey, created);
      return created;
    };

    for (const candidate of params.termTypeCandidates) {
      const key = clusterKey([
        "term_type",
        candidate.normalizedFieldName,
        candidate.sourceProductType,
        candidate.reason,
      ]);
      const parts = [
        "term_type",
        candidate.normalizedFieldName,
        candidate.sourceProductType,
        candidate.reason,
      ];
      const cluster = ensureCluster({
        clusterKey: key,
        clusterId: clusterId(parts),
        readableClusterId: readableClusterId(parts),
        clusterLabel: clusterLabel(parts),
        candidateType: "term_type",
        sourceProductType: candidate.sourceProductType ?? "unknown",
        reason: candidate.reason,
        normalizedFieldName: candidate.normalizedFieldName,
      });
      cluster.candidateIds.push(candidate.id);
      cluster.rawFieldNameSamples.push(candidate.rawFieldName);
      if (candidate.rawValue) cluster.rawValueSamples.push(candidate.rawValue);
      cluster.normalizedFieldNameSamples.push(candidate.normalizedFieldName);
      if (candidate.documentId) cluster.documentIds.add(candidate.documentId);
      const candidateOccurrences =
        occurrencesByCandidate.get(`term_type:${candidate.id}`) ?? [];
      this.mergeClusterOccurrences({
        cluster,
        candidate,
        candidateType: "term_type",
        occurrences: candidateOccurrences,
        documentMap,
        itemNameMap,
      });
    }

    for (const candidate of params.valueCandidates) {
      const key = clusterKey([
        "value",
        candidate.termType,
        candidate.normalizedRawValue,
        candidate.sourceProductType,
        candidate.reason,
      ]);
      const parts = [
        "value",
        candidate.termType,
        candidate.normalizedRawValue,
        candidate.sourceProductType,
        candidate.reason,
      ];
      const cluster = ensureCluster({
        clusterKey: key,
        clusterId: clusterId(parts),
        readableClusterId: readableClusterId(parts),
        clusterLabel: clusterLabel(parts),
        candidateType: "value",
        sourceProductType: candidate.sourceProductType ?? "unknown",
        reason: candidate.reason,
        termType: candidate.termType,
        normalizedRawValue: candidate.normalizedRawValue,
      });
      cluster.candidateIds.push(candidate.id);
      cluster.rawValueSamples.push(candidate.rawValue);
      if (candidate.documentId) cluster.documentIds.add(candidate.documentId);
      const candidateOccurrences =
        occurrencesByCandidate.get(`value:${candidate.id}`) ?? [];
      this.mergeClusterOccurrences({
        cluster,
        candidate,
        candidateType: "value",
        occurrences: candidateOccurrences,
        documentMap,
        itemNameMap,
      });
    }

    const result = [...clusters.values()].map((cluster) => {
      cluster.candidateIds = uniqueLimited(cluster.candidateIds, 100);
      cluster.rawValueSamples = uniqueLimited(cluster.rawValueSamples, 12);
      cluster.rawFieldNameSamples = uniqueLimited(cluster.rawFieldNameSamples, 12);
      cluster.normalizedFieldNameSamples = uniqueLimited(
        cluster.normalizedFieldNameSamples,
        12,
      );
      cluster.commonContexts = uniqueLimited(cluster.contextCandidates, 8);
      cluster.documentCount = cluster.documentIds.size;
      cluster.occurrenceCount =
        cluster.occurrenceCount > 0
          ? cluster.occurrenceCount
          : cluster.candidateIds.length;
      const { documentIds: _documentIds, contextCandidates: _contexts, ...publicCluster } =
        cluster;
      return publicCluster;
    });

    return result
      .sort((left, right) => {
        if (right.documentCount !== left.documentCount) {
          return right.documentCount - left.documentCount;
        }
        return right.occurrenceCount - left.occurrenceCount;
      })
      .slice(0, Math.max(1, Math.floor(params.limit ?? 200)));
  }

  private mergeClusterOccurrences(params: {
    cluster: CandidateClusterInput & {
      documentIds: Set<string>;
      contextCandidates: string[];
    };
    candidate: DictionaryTermTypeCandidate | DictionaryCandidate;
    candidateType: "term_type" | "value";
    occurrences: DictionaryCandidateOccurrence[];
    documentMap: Map<string, Documents>;
    itemNameMap: Map<string, string>;
  }) {
    const fallbackDocumentId = params.candidate.documentId;
    const fallbackExtractionResultId = params.candidate.extractionResultId;
    const fallbackItemIndex = params.candidate.itemIndex;
    const fallbackItemName =
      params.itemNameMap.get(
        `${fallbackExtractionResultId ?? ""}:${fallbackItemIndex ?? ""}`,
      ) ?? null;

    if (fallbackDocumentId) {
      params.cluster.documentIds.add(String(fallbackDocumentId));
    }
    if (fallbackItemName) {
      params.cluster.contextCandidates.push(fallbackItemName);
    }
    params.cluster.contextCandidates.push(...textFromEvidence(params.candidate.evidence));

    for (const occurrence of params.occurrences) {
      params.cluster.occurrenceCount += 1;
      params.cluster.documentIds.add(String(occurrence.documentId));
      params.cluster.rawFieldNameSamples.push(occurrence.fieldName);
      if (occurrence.rawValue) {
        params.cluster.rawValueSamples.push(occurrence.rawValue);
      }
      const itemName =
        params.itemNameMap.get(
          `${occurrence.extractionResultId}:${occurrence.itemIndex}`,
        ) ?? null;
      if (itemName) {
        params.cluster.contextCandidates.push(itemName);
      }
      params.cluster.contextCandidates.push(...textFromEvidence(occurrence.evidence));
      if (params.cluster.sampleOccurrences.length < 5) {
        params.cluster.sampleOccurrences.push({
          documentId: String(occurrence.documentId),
          fileName:
            params.documentMap.get(String(occurrence.documentId))?.fileName ??
            null,
          itemIndex: occurrence.itemIndex,
          itemName,
          rawFieldName: occurrence.fieldName,
          rawValue: occurrence.rawValue,
        });
      }
    }

    if (params.occurrences.length === 0 && params.cluster.sampleOccurrences.length < 5) {
      const rawFieldName =
        params.candidateType === "term_type"
          ? (params.candidate as DictionaryTermTypeCandidate).rawFieldName
          : (params.candidate as DictionaryCandidate).termType;
      const rawValue =
        params.candidateType === "term_type"
          ? (params.candidate as DictionaryTermTypeCandidate).rawValue
          : (params.candidate as DictionaryCandidate).rawValue;
      params.cluster.sampleOccurrences.push({
        documentId: String(fallbackDocumentId ?? ""),
        fileName:
          fallbackDocumentId === null
            ? null
            : params.documentMap.get(String(fallbackDocumentId))?.fileName ?? null,
        itemIndex: fallbackItemIndex,
        itemName: fallbackItemName,
        rawFieldName,
        rawValue,
      });
    }
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

    return buildExtractionItemNameMap(this.dataSource, extractionResultIds);
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
      purpose: "product_config_agent_term_type_suggestion",
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
      purpose: "product_config_agent_value_split_suggestion",
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
