# 生产明细 Excel 批量 Parse 脚本

脚本用于扫描一个目录下的 `.xls` / `.xlsx` 文件，按文件内容计算 hash，跳过已经有 `document_blocks` 的文件，只解析新文件或只有 document 但缺 blocks 的文件。

脚本入口：

```text
src/features/productConfigAgent/scripts/parseProductionDetailExcels.ts
```

## 推荐命令

从 `/Volumes/jcyxb` 扫描并处理全部 Excel：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb"
```

从第 10000 个文件开始继续跑：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb" --start=10000
```

从第 10000 个文件开始，只跑 2000 个：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb" --start=10000 --limit=2000
```

调整每批数量，例如每批 500 个：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb" --batchSize=500
```

外置盘或网络盘较慢时，可以调 hash 并发。默认是 8：

```bash
NODE_NO_WARNINGS=1 PRODUCT_CONFIG_AGENT_BATCH_HASH_CONCURRENCY=16 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb"
```

如果实际需要解析的新文件很多，也可以调 Parse 并发。默认是 4：

```bash
NODE_NO_WARNINGS=1 PRODUCT_CONFIG_AGENT_BATCH_HASH_CONCURRENCY=16 PRODUCT_CONFIG_AGENT_BATCH_PARSE_CONCURRENCY=4 npm run product-config-agent:parse-production-detail-excels -- "/Volumes/jcyxb"
```

## 参数说明

- `sourceDir`：第一个位置参数，扫描目录。例如 `"/Volumes/jcyxb"`。
- `--sourceDir=<path>`：也可以用命名参数指定扫描目录。
- `--start=10000`：从排序后的第 10000 个文件开始，序号从 1 开始。
- `--limit=2000`：最多处理 2000 个文件。
- `--batchSize=500`：每批处理 500 个文件，默认 200。

## 顺序说明

脚本会递归收集所有 Excel 文件，然后按完整路径用 `zh-CN` locale 排序。

只要目录内容、文件名和路径不变，每次运行顺序一致。因此可以用 `--start` 从日志里的序号继续跑。

## 输出说明

运行时会看到类似：

```text
扫描目录: /Volumes/jcyxb
发现 Excel 文件数: 30485
本次处理范围: 10000-30485/30485 selected=20486 batchSize=200
[10000-10199/30485] parsing production detail excels...
[10000-10199/30485] done in 4.2s success=200 reused=198 parsed=2 errors=0
```

- `success`：本批成功返回的文件数。
- `reused`：已有 blocks，跳过 Parse 的文件数。
- `parsed`：本批实际执行 Excel Parse 的文件数。
- `errors`：本批失败文件数。

## 日志文件

脚本会写入 `logs/`：

```text
production-detail-excel-parse-blocks-errors-<timestamp>.jsonl
production-detail-excel-parse-blocks-summary-<timestamp>.json
```

summary 里会记录本次处理范围、成功/失败、documentId、blocksId 和是否复用 blocks。

## 同名不同 hash 重复治理

先执行 migration，创建重复映射表：

```bash
psql "$DATABASE_URL" -f src/features/productConfigAgent/scripts/migration_add_document_duplicates.sql
```

只生成报告，不写数据库：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:report-duplicate-production-detail-documents
```

应用同名同内容的 duplicate mapping：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:apply-duplicate-production-detail-documents
```

如果报告里有 `missing_blocks`，先补齐 blocks，再重新分类并应用：

```bash
NODE_NO_WARNINGS=1 npm run product-config-agent:apply-duplicate-production-detail-documents -- --parseMissing
```

Excel Parse 成功后也会自动对本次文件名应用 duplicate mapping：单文件 Parse 只检查当前文件名，批量 Parse 只检查本批成功的文件名。

这个流程不会删除 `documents`，不会按文件名合并，也不会复制 LLM extraction；它只把同名且解析内容一致的副本写入 `quote_agent.document_duplicates`，后续 pending LLM 队列会自动跳过这些副本。

## 常见提醒

- `ExperimentalWarning` 和 `DEP0180` 是 Node / ts-node 的 warning，不是脚本失败。推荐命令里用 `NODE_NO_WARNINGS=1` 隐藏它们。
- 如果每批仍然很慢，通常是外置盘/网络盘读取文件算 hash 慢。可以先试 `PRODUCT_CONFIG_AGENT_BATCH_HASH_CONCURRENCY=16`，如果更慢就降回 8 或 4。
- 脚本不会重复解析已有 blocks 的文件；如果只有 document 但没有 blocks，会补 Parse。
