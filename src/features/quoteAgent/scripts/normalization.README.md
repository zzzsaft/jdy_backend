# quoteAgent normalization 重跑说明

这些命令用于根据当前字典重新执行 quoteAgent dictionary normalization。

注意：

- 不会重新调用抽取 LLM。
- 只会基于已有的 `extraction_json` 重新生成 `normalized_extraction_json` 和相关字典结果。
- 默认不会把旧的 pending candidate 改成 `auto_resolved`。
- 建议先用小批量测试，确认结果正常后再全量执行。

## 脚本命令

### 小批量测试

先跑 5 条，每批 2 条：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='all'
$env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT='5'
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='2'
node --loader ts-node/esm src/features/quoteAgent/scripts/runFullNormalizationWithMasterData.ts
```

如果希望 normalization 后顺便重新检查 pending candidate，并把已经能被当前字典解决的 candidate 标记为 `auto_resolved`，加上：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_CANDIDATES='1'
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_LIMIT='5000'
```

### 全量重跑

处理所有有 `extraction_json` 的记录：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='all'
Remove-Item Env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT -ErrorAction SilentlyContinue
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='100'
node --loader ts-node/esm src/features/quoteAgent/scripts/runFullNormalizationWithMasterData.ts
```

### 只重跑有 pending candidate 的记录

不用 HTTP 接口时，直接设置 `QUOTE_AGENT_FULL_NORMALIZE_SCOPE`：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='with_pending_candidates'
$env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT='5'
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='2'
node --loader ts-node/esm src/features/quoteAgent/scripts/runFullNormalizationWithMasterData.ts
```

确认小批量正常后，可以去掉 `QUOTE_AGENT_FULL_NORMALIZE_LIMIT`，处理所有当前仍关联 pending candidate 的记录：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='with_pending_candidates'
Remove-Item Env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT -ErrorAction SilentlyContinue
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='100'
node --loader ts-node/esm src/features/quoteAgent/scripts/runFullNormalizationWithMasterData.ts
```

全量重跑后顺便清理可自动解决的 pending candidate：

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='with_pending_candidates'
Remove-Item Env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT -ErrorAction SilentlyContinue
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='100'
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_CANDIDATES='1'
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_LIMIT='5000'
node --loader ts-node/esm src/features/quoteAgent/scripts/runFullNormalizationWithMasterData.ts
```

### 旧版单批脚本

设置 `QUOTE_AGENT_RENORMALIZE_ALL=1` 后，会包含已经有
`normalized_extraction_json` 的记录：

```powershell
$env:QUOTE_AGENT_RENORMALIZE_ALL='1'
$env:QUOTE_AGENT_RENORMALIZE_LIMIT='20'
node --loader ts-node/esm src/features/quoteAgent/scripts/renormalizeExistingExtractions.ts
```

## HTTP 接口

后端本地服务运行时，也可以直接调用接口：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:2001/quoteAgent/extractions/renormalize-batch' `
  -ContentType 'application/json' `
  -Body '{"scope":"all","limit":5,"batchSize":2}'
```

请求体：

```json
{
  "scope": "all",
  "limit": 5,
  "batchSize": 2
}
```

## scope 说明

`scope` 控制重跑范围：

- `all`：重跑所有有 `extraction_json` 的记录，即使之前已经 normalized。
- `missing_normalized`：只处理缺少 `normalized_extraction_json` 的记录。
- `with_pending_candidates`：只处理当前仍关联 pending dictionary candidate 的记录。

只重跑有 pending candidate 的记录：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:2001/quoteAgent/extractions/renormalize-batch' `
  -ContentType 'application/json' `
  -Body '{"scope":"with_pending_candidates","limit":5,"batchSize":2}'
```

## 返回结构

接口会返回处理统计和一小段预览：

```json
{
  "scope": "with_pending_candidates",
  "requestedLimit": 5,
  "batchSize": 2,
  "onlyMissingNormalized": false,
  "withPendingCandidates": true,
  "processedCount": 5,
  "successCount": 5,
  "failedCount": 0,
  "failedResults": [],
  "resultPreview": [
    {
      "extractionResultId": 111,
      "documentId": 110,
      "status": "normalized"
    }
  ]
}
```
