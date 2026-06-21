# Concept Layer Candidate Resolve

Concept Layer 的 candidate resolve 用于给 dictionary candidate 生成可追踪的概念判断：

- 写入 `quote_agent.concept_resolutions`
- 写入或更新 `quote_agent.concept_pattern_reviews`
- 回写 candidate 的 `resolver_status`、`resolver_route`、`resolver_score`、`resolver_risk_level`、`resolver_decision_jsonb` 和 `last_resolved_at`
- 记录本次运行到 `quote_agent.concept_resolver_runs`

当前实现会生成 resolver 决策记录，但不会直接把 candidate 审核通过、驳回或改字典。真正的 candidate 审核仍走候选审核接口或后台页面。

## 一次性准备

如果目标数据库还没有 Concept Resolver 表和字段，先执行迁移。脚本支持在回填前自动执行迁移：

```bash
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_APPLY_MIGRATION=1 \
npm run product-config-agent:concept-resolver-backfill
```

迁移 SQL 位于：

```text
src/features/productConfigAgent/scripts/migration_add_concept_resolver_v1.sql
```

## 命令 Resolve

小批量试跑全部 candidate：

```bash
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT=20 \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_BATCH_SIZE=20 \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_CONCURRENCY=4 \
npm run product-config-agent:concept-resolver-backfill
```

只 resolve 字段 Key 候选：

```bash
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE=term_type \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT=50 \
npm run product-config-agent:concept-resolver-backfill
```

只 resolve 字段值候选：

```bash
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE=value \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT=50 \
npm run product-config-agent:concept-resolver-backfill
```

确认小批量结果正常后，全量 resolve：

```bash
unset QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE=all \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_BATCH_SIZE=100 \
QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_CONCURRENCY=8 \
npm run product-config-agent:concept-resolver-backfill
```

## 常用参数

- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_TYPE`：`all`、`term_type` 或 `value`，默认 `all`。
- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_LIMIT`：最多处理多少条；不设置表示全量。
- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_BATCH_SIZE`：每批读取多少 candidate，默认 `100`。
- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_CONCURRENCY`：批内并发，默认 `8`，最大 `32`。
- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_REPORT_LIMIT`：运行结果中 issue summary 的样本数量，默认 `50`。
- `QUOTE_AGENT_CONCEPT_RESOLVER_BACKFILL_APPLY_MIGRATION`：设为 truthy 时先执行 Concept Resolver 迁移。

## HTTP Resolve

后端服务运行时，也可以通过接口触发一次 manual run：

```bash
curl -X POST 'http://localhost:2001/productConfigAgent/concept-resolver/run' \
  -H 'Content-Type: application/json' \
  -d '{"candidateType":"all","status":"pending","limit":100}'
```

请求体字段：

- `candidateType`：`all`、`term_type` 或 `value`，默认 `all`。
- `status`：candidate 状态，默认 `pending`。
- `limit`：最多处理多少条。
- `includeReviewed`：设为 `true` 时不按 `status` 过滤。
- `apply`：当前服务层会记录 run mode，但 resolve 实现仍不直接自动应用字典变更。

## 查看结果

查看 run：

```bash
curl 'http://localhost:2001/productConfigAgent/concept-resolver/runs/<runId>'
```

查看最近的 resolutions：

```bash
curl 'http://localhost:2001/productConfigAgent/concept-resolver/resolutions?limit=100'
```

按 route 或 candidate 类型过滤：

```bash
curl 'http://localhost:2001/productConfigAgent/concept-resolver/resolutions?route=human_review&candidateType=term_type&limit=100'
```

查看 pattern 聚合：

```bash
curl 'http://localhost:2001/productConfigAgent/concept-resolver/patterns?status=pending&limit=100'
```

## Pattern Review

Concept Resolver 会把相同概念问题聚合成 `pattern_key`。人工确认 pattern：

```bash
curl -X POST 'http://localhost:2001/productConfigAgent/concept-resolver/patterns/<patternKey>/review' \
  -H 'Content-Type: application/json' \
  -d '{"status":"reviewed","reviewedBy":"operator"}'
```

把 pattern 对应的 candidate 标记为待人工应用：

```bash
curl -X POST 'http://localhost:2001/productConfigAgent/concept-resolver/patterns/<patternKey>/apply-candidates' \
  -H 'Content-Type: application/json' \
  -d '{"reviewedBy":"operator","limit":100}'
```

这一步只会在 pattern review payload 中生成 `pending_manual_apply` 操作清单，不会直接审核 candidate。

## Dictionary Audit

如果要扫描正式字典里可能已经存在的概念问题，运行：

```bash
npm run product-config-agent:concept-resolver-audit
```

这和 candidate resolve 是两条不同路径：audit 面向正式字典数据，backfill/run 面向 candidate。

## Candidate 分桶处理

跑完 Concept Resolver 后，不要只按 candidate 数量处理，先按 `resolver_route`、`resolver_risk_level` 和 `resolver_decision_jsonb.recommendedAction` 分桶。

2026-06-21 当前过滤后观察到的 pending candidate 主要类型：

| bucket | 主要类型 | 建议处理 |
| --- | --- | --- |
| `normalization_rule_covered_qualifier_*` | normalization rule 已能表达的 qualifier key/value | 通常不作为新概念审核；先重跑 normalization/recheck，仍存在再看 rule 是否缺 occurrence 清理。 |
| `qualifier_like_not_in_rule_list` | 类似 qualifier，但规则表没有收录 | 不急着进字典；先补 qualifier/rule，再重跑 normalization。 |
| `dictionary_work` | 真实字典缺枚举或 alias，例如材料/应用常见值 | 走候选审核或批量字典补录。 |
| `needs_split_or_rule_check` | 一个 raw value 混入多个业务属性 | 优先检查 extraction split_fields 或 normalization split rule，不直接 approve 整段值。 |
| `wrong_scope_or_cross_concept` | 把产量、温度、规格、部位词等混入 application/material | 高风险；优先修 prompt、re-extraction 或 normalization 兜底。 |
| `defer` | 证据不足或低价值噪声 | 暂缓；等同类 pattern 聚合后再处理。 |
| `auto_reject_pending` / noise | 明显单位、说明残片、乱码 | 可批量 reject，但要先抽样确认。 |

当前 `heating_voltage` 类混写已经有 normalization rule 拆分；过滤后不应再当作主要 candidate 类型处理。如果看到新的 `heating_voltage` pending，先查是否是旧 extraction 未重跑、occurrence 没清理，还是 rule pattern 没覆盖。

### Re-extraction 优先的类型

像 `PVC保鲜膜模头（产量500KG/每小时）` 这类，正确结果应是：

- `塑料原料 = PVC`
- `应用类型 = 保鲜膜`
- `产量 = 500KG/每小时`

不要把 `保鲜膜模头产量500kg、每小时` approve 成新的 `application`。这类通常说明 extraction 没输出足够好的 `split_fields`，应先单文档 re-extraction 验证：

```bash
node --loader ts-node/esm -r dotenv/config \
  src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts \
  --mode=one \
  --documentId=<documentId> \
  --promptVersion=v3-plan-item-20260616 \
  --force
```

如果 re-extraction 后仍产生同类 candidate，优先修 two-stage extraction prompt；如果 prompt 已正确但 candidate 仍存在，再补 normalization 兜底 split rule。

### Recheck 后仍存在的 candidate

renormalize 后 candidate 仍在时，先判断它是否仍被当前 `normalized_extraction_json` 引用：

- 如果 normalized field 里仍有 `candidate.candidate_id`，说明当前 normalization/extraction 仍会生成该候选，需要继续修 rule、字典或 re-extraction。
- 如果 normalized JSON 已经不再引用该 candidate，但 `dictionary_candidates.status = 'pending'`，这是旧 occurrence/candidate 残留，应由 candidate recheck 标记为 resolved。

代表例：`PVC保鲜膜模头（产量500KG/每小时）`

- renormalize 后字段变为 `plastic_material = PVC`，并拆出 `capacity = 500KG/每小时`。
- `application = 保鲜膜` 已在正式字典中，应命中 `preservative_film`，不应再生成 value candidate。
- 旧候选 `保鲜膜模头产量500kg、每小时` 不再被 normalized JSON 引用，应标记为 `auto_resolved_by_normalization_refresh:no_current_reference`。

## 推荐流程

1. 小批量跑 `product-config-agent:concept-resolver-backfill`。
2. 看 run 输出里的 `routeCounts`、`relationCounts`、`recommendedActionCounts` 和 `issueSummary`。
3. 用 resolutions/patterns 接口筛出 `human_review`、`auto_reject_pending` 和 `risk_level=high` 的候选。
4. 人工确认 pattern，再走候选审核工作流处理真实 candidate。
5. 字典变更后按需重跑 normalization，命令见 [Normalization rerun](../../src/features/productConfigAgent/scripts/normalization.README.md)。
