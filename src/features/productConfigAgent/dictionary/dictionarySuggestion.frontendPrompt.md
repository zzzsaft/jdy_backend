# 前端实现 Prompt：productConfigAgent 候选簇审核

请实现一个“字典候选簇审核”页面，用于按候选簇批量治理字典候选，而不是按 document 逐条审核。

## 目标

- 页面入口：字典候选管理下新增“候选簇审核”视图。
- 核心对象是 `candidateCluster`，一个簇可能包含多个 document 中重复出现的候选。
- 默认展示 `status=pending` 的候选簇，按 `documentCount`、`occurrenceCount` 高到低排序。
- 支持 AI 生成簇级建议，人工确认后再提交批量审核操作。

## 接口

- 获取提示词说明：`GET /productConfigAgent/candidates/clusters/review-prompt`
- 获取候选簇：`GET /productConfigAgent/candidates/clusters?status=pending&limit=200`
- 可选按文档过滤：`GET /productConfigAgent/candidates/clusters?status=pending&documentId=123&limit=200`
- AI 生成簇级建议：`POST /productConfigAgent/candidates/clusters/suggestions/batch`
- 提交批量审核：`POST /productConfigAgent/candidates/reviews/batch`

## 列表字段

每一行展示：

- 候选类型：`term_type` / `value`
- 聚类 key 摘要：字段名用 `normalizedFieldName`，字段值用 `termType + normalizedRawValue`
- 候选数量：`candidateIds.length`
- 涉及文档数：`documentCount`
- 出现次数：`occurrenceCount`
- 来源产品类型：`sourceProductType`
- 原因：`reason`
- 常见 raw field/value：`rawFieldNameSamples`、`rawValueSamples`
- 常见上下文：`commonContexts`
- 样例：`sampleOccurrences`，显示 document、item、rawFieldName、rawValue

## 交互

- 顶部筛选：状态、documentId、limit、候选类型。
- 操作按钮：
  - “刷新候选簇”：调用 `GET /productConfigAgent/candidates/clusters`
  - “生成 AI 建议”：调用 `POST /productConfigAgent/candidates/clusters/suggestions/batch`
  - “应用已勾选建议”：把选中簇的 `batchOperationsPreview` 转换成 `operations` 提交到 `/productConfigAgent/candidates/reviews/batch`
- 每个簇可以展开查看全部样例和 candidateIds。
- AI 建议以审核卡片展示：`recommendedAction`、`confidence`、`riskLevel`、`humanReviewSummary`、`reason`。
- 高风险或 `needs_human_review` 默认不勾选。
- `confidence < 0.85` 默认不勾选。

## 批量提交规则

- 前端不要自动执行 AI 建议，必须人工勾选确认。
- `batchOperationsPreview` 只是预览，提交前要让用户二次确认影响的 candidate 数量。
- 提交时设置 `deferCandidateRecheck=true`，避免每个 candidate 审核后立即触发候选重查；批量完成后由后端延迟重查。
- 提交成功后刷新列表，已解决的 pending candidate 应从 pending 列表消失或状态变为 approved/auto_resolved。

## 状态提示

- 空状态：暂无待审核候选簇。
- 加载 AI 建议时显示进度，提示“按候选簇生成，不按文档逐条生成”。
- 提交成功后显示：成功数、失败数、受影响文档数。
- 失败行保留错误信息，允许用户单独重试。
