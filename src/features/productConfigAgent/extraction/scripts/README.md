# Quote Agent Scripts

## XH LLM 抽取脚本

脚本入口：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts
```

脚本会读取 `.env` 中的：

- `XH_ADDRESS`
- `XH_AUTH_TOKEN`
- `XH_MODEL`，可选，默认使用脚本内配置

XH 请求会通过 `Authorization: Bearer <XH_AUTH_TOKEN>` 发送。

### 数据库前置条件

两阶段抽取会把 document plan 保存到 `quote_agent.extraction_results.llm_plan_json`。

如果数据库还没有这个字段，先手动执行：

### 连通性测试

只测试 XH 是否可用，不读写 productConfigAgent 业务表。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=ping
```

### 只生成 Document Plan

适合先给大量文件做规划：识别 document 中有几个 item、每个 item 的产品类型、文本范围和 item 之间关系。

这个模式只写入 `llm_plan_json`，状态为 `planned`，不会抽字段，也不会生成 dictionary candidate。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --limit=20000 --concurrency=8 --promptVersion=v3-plan-item
```

只给单个 document 生成 plan：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --documentId=8 --promptVersion=v3-plan-item
```

强制重做 plan：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --documentId=8 --promptVersion=v3-plan-item --force
```

### 按已有 Plan 抽取 Item

读取状态为 `planned` 或 `planned_partial` 的 extraction，根据 `llm_plan_json` 抽取尚未抽过的 item。

抽完的 item 会在 plan 中标记 `extraction_status = "extracted"` 和 `extracted_at`，后续再次运行不会重复抽这些 item。

抽全部待抽 item：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item --limit=500 --concurrency=8 --promptVersion=v3-plan-item
```

只抽某一种产品类型，例如分配器：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item --limit=500 --concurrency=8 --promptVersion=v3-plan-item --productType=feedblock
```

`productType` 以数据库中的 `quote_agent.dictionary_terms`
里 `term_type = 'product_type'` 的 `canonical_value` 为准。下面只是当前常见值示例：

- `flat_die`：平模头
- `feedblock`：分配器
- `filter`：过滤器 / 换网器
- `metering_pump`：计量泵
- `hydraulic_station`：液压站
- `melt_pipe`：连接器 / 熔体管道
- `blown_film_die`：吹膜模头
- `coating_die`：涂布模头
- `die_cart`：模具小车
- `unknown`：未识别类型

### 一步完成两阶段抽取

先 plan，再立刻按 item 抽取，最终走 dictionary normalization。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=batch --limit=500 --concurrency=8 --promptVersion=v3-plan-item
```

快捷写法：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=batch --limit=500 --concurrency=8 --twoStage
```

### 单个 Document 完整抽取

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=one --documentId=8 --promptVersion=v3-plan-item
```

强制重抽：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=one --documentId=8 --promptVersion=v3-plan-item --force
```

### 运行建议

- 先用 `--mode=plan --limit=20` 小批量检查 plan 质量。
- 大量导入时先跑 `--mode=plan --limit=20000 --concurrency=8`。
- 字典完善后，再按产品类型分批跑 `--mode=item --productType=<type>`。
- `--mode=plan` 不会生成 candidate；`--mode=item` 和 `--mode=batch` 会继续走 dictionary normalization，可能生成 candidate。
- 已经生成过 plan 的 document 默认不会重复 plan，除非加 `--force`。
- 已经抽过的 item 默认不会重复抽，会根据 `llm_plan_json.items[].extracted_at` 跳过。
