# productConfigAgent Flow

This directory is the historical implementation location for productConfigAgent.
New code, prompts, docs, and frontend calls should use the productConfigAgent
name. See `src/features/productConfigAgent/README.md` for the architecture and
naming rules.

productConfigAgent 用于把报价/合同/生产明细类 Excel 文件解析成可审核、可归档的结构化产品配置数据。主流程分为：

```text
upload/input file
  -> excelParser
  -> extraction
  -> normalization
  -> dictionary review
  -> archive
```

核心门面仍是 `productConfigAgentService`，定义在 `src/features/productConfigAgent/service.ts`。该文件只保留对外 API 和主编排，具体职责已经拆到 `workflow/`、`extraction/`、`normalization/`、`dictionary/`、`query/`。

## Module Responsibilities

### `excelParser/`

纯 Excel 解析层，不写数据库。

- 输入：本地 Excel 文件或下载后的 Excel 文件。
- 输出：`blocksJson`、`blocks[]`、`llm_text`。
- 主要职责：把 Excel 表格、文本框、选项标记等转换成 LLM 友好的文本和 block。
- 不负责：document 入库、hash、status、LLM 调用、dictionary。

### `workflow/blockParsing.service.ts`

productConfigAgent 文档和 blocks 入库编排。

- 计算文件 SHA-256。
- 查找或创建 `quote_agent.documents`。
- 查找或写入 `quote_agent.document_blocks`。
- 批量 parse 时按 file hash 去重。
- 更新 document status 为 `uploaded` / `parsed_blocks` / `failed`。

### `extraction/`

raw extraction 层：调用模型从 blocks/llm_text 中抽取原始 JSON。

- `providers/`：不同模型 provider 的适配，如 DeepSeek、XH、InferAIChat、local。
- `prompts/`：raw extraction prompt。
- `validation/`：解析并校验 LLM 返回 JSON shape。
- `twoStage/`：两阶段抽取逻辑。
- `scripts/`：抽取脚本和脚本文档。

extraction 只做 raw extraction，不做 dictionary normalization。LLM 输出中不应该出现 `term_type`、`canonical_value` 或最终标准值。

### `normalization/`

把 LLM raw extraction 转成 `normalized_extraction_json`。

- `extractionNormalization.service.ts`：单次 extraction normalization。
- `normalizationRefresh.service.ts`：重跑 normalization、按 document 刷新 dictionary result。
- 负责调用 `DictionaryService.normalizeField()`。
- 负责生成 dictionary candidate、warning、summary。

### `dictionary/`

字典、alias、candidate 和审核工作流。

- `dictionary.service.ts`：字段名/字段值匹配、候选生成、字典 cache。
- `candidateReviewWorkflow.service.ts`：候选审核后刷新受影响 document，或标记 `dictionary_dirty`。
- `conceptResolver.service.ts`：Concept Layer candidate resolve，生成 resolution、pattern review 和 candidate resolver snapshot。
- `dictionarySuggestion.*`：候选聚类、AI 辅助审核建议。

### `archive/`

把 normalized extraction 发布成归档合同数据。

- 归档 document。
- 维护 archive item、版本和产品绑定。
- 支持基于 normalized JSON 的查询和后续修订。

### `query/`

productConfigAgent 查询门面。

- contract detail。
- extraction detail。
- document list。
- candidate list。

## Main Upload Flow

入口通常是：

```text
POST /productConfigAgent/contracts/upload
  -> productConfigAgentService.process()
```

执行顺序：

```text
1. parseAndSaveBlocks()
   - calculateFileSha256()
   - create/find document
   - parse Excel into blocksJson
   - upsert document_blocks

2. extractWithLLM()
   - build llm_text if needed
   - call extraction provider
   - create extraction_results row
   - status = parsed

3. generateDictionaryForExtraction()
   - coerce LLM extraction shape
   - normalize fields through dictionary
   - write normalized_extraction_json
   - write dictionary_proposals
   - status = normalized
```

Typical status transition:

```text
uploaded -> parsed_blocks -> extracted -> normalized
```

If a step fails, document status is set to `failed`.

## Two Stage Extraction

Two stage extraction is used when `promptVersion = "v3-plan-item-20260616"`.

Runtime code:

- `src/features/productConfigAgent/extraction/twoStage/twoStageExtract.ts`
- `planDocumentWithXh()`
- `extractItemsFromPlanWithXh()`
- `extractProductConfigWithTwoStageXh()`

Script and commands:

- `src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts`
- `src/features/productConfigAgent/extraction/scripts/README.md`

Two stage can run separately:

```text
1. --mode=plan
   - identify document_info and item plan
   - write llm_plan_json
   - status = planned
   - no item field extraction
   - no dictionary candidate generation

2. --mode=item
   - read planned / planned_partial extraction
   - extract item fields from llm_plan_json
   - merge extracted items into extraction_json
   - run normalization
   - status = planned_partial or normalized
```

One-shot modes also exist:

```text
--mode=batch --twoStage
--mode=one --documentId=<id> --promptVersion=v3-plan-item-20260616
```

## Normalization Rerun Flow

Normalization rerun does not call LLM. It only reuses existing `extraction_json`.

Script docs:

- `src/features/productConfigAgent/scripts/normalization.README.md`

Typical use cases:

- dictionary has changed and old extraction needs updated normalized output.
- only missing `normalized_extraction_json` should be filled.
- documents with pending candidates should be re-normalized after dictionary changes.

## Candidate Review Flow

Candidate review endpoints call:

```text
productConfigAgentService.reviewCandidateAndRefresh()
productConfigAgentService.reviewCandidatesBatch()
```

The workflow is:

```text
1. apply candidate action
   - create term type
   - approve alias
   - split candidate
   - create value
   - reject

2. bump dictionary version when needed

3. recheck pending candidates

4. either:
   - refresh affected documents immediately, or
   - mark affected documents as dictionary_dirty
```

For large batch reviews, prefer deferred candidate recheck and dictionary dirty marking instead of immediate document refresh.

## Concept Layer Candidate Resolve

Concept Layer resolve 用于给 pending candidate 生成概念判断和 pattern 聚合，不直接替代人工候选审核。

Command docs:

- `docs/productConfigAgent/concept-layer-candidate-resolve.md`

Typical command:

```bash
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT=20 npm run product-config-agent:concept-resolver-backfill
```

## Archive Flow

After a document is normalized and accepted, archive logic reads `normalized_extraction_json` and creates or updates contract archive records.

Archive code lives under:

```text
src/features/productConfigAgent/archive/
```

Archive is downstream of normalization. It should not call extraction LLM or mutate dictionary candidates.

### Archive Existing Normalized Contracts

Use this script to archive existing normalized documents that have non-empty
`normalized_extraction_json.items` and are not already archived:

```bash
npm run product-config-agent:archive-existing
```

Useful environment variables:

```bash
# Preview candidates only; does not write archive records.
QUOTE_AGENT_ARCHIVE_EXISTING_DRY_RUN=true npm run product-config-agent:archive-existing

# Default limit is 100. Use a number or all.
QUOTE_AGENT_ARCHIVE_EXISTING_LIMIT=20 npm run product-config-agent:archive-existing
QUOTE_AGENT_ARCHIVE_EXISTING_LIMIT=all npm run product-config-agent:archive-existing

# Force archive when readiness blockers exist.
QUOTE_AGENT_ARCHIVE_EXISTING_FORCE=true npm run product-config-agent:archive-existing

# Mark archived_by.
QUOTE_AGENT_ARCHIVE_EXISTING_BY=your-name npm run product-config-agent:archive-existing
```

## Important Boundaries

- `excelParser/` parses Excel only.
- `extraction/` calls LLM and returns raw extraction only.
- `normalization/` converts raw extraction to normalized JSON using dictionary.
- `dictionary/` owns terms, aliases, candidates and review.
- `archive/` owns published contract archive data.
- `service.ts` remains the external facade for routes and scripts.
- Do not add new productConfigAgent UI behavior to the legacy single-page HTML at
  `public/quote-agent/index.html`; it is no longer a maintained frontend
  surface. Keep productConfigAgent UI work in the project’s maintained frontend instead.

## Key Files

```text
src/features/productConfigAgent/service.ts
src/features/productConfigAgent/workflow/blockParsing.service.ts
src/features/productConfigAgent/workflow/plannedExtraction.service.ts
src/features/productConfigAgent/workflow/pendingLlmJob.service.ts
src/features/productConfigAgent/extraction/
src/features/productConfigAgent/normalization/
src/features/productConfigAgent/dictionary/
src/features/productConfigAgent/archive/
src/features/productConfigAgent/query/productConfigAgentQuery.service.ts
```
