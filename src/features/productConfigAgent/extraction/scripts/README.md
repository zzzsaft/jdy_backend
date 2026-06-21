# Quote Agent Scripts

## LLM 抽取脚本

脚本入口：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts
```

脚本默认使用 InferAIChat 中转站。InferAIChat 会读取 `.env` 中的：

- `ANTHROPIC_AUTH_TOKEN`
- `INFERAI_MODEL`，可选，默认 `inferaichat:deepseek-v4-flash`
- `INFERAI_BASE_URL`，可选，默认 `https://inferaichat.com/v1`

也可以用通用中转站配置，后续换中转站优先改这里，不需要改脚本：

- `LLM_GATEWAY=xh | inferaichat`
- `LLM_MODEL=deepseek-v4-flash`，可选

如果临时切回 XH，中转站会读取：

- `XH_ADDRESS`
- `XH_AUTH_TOKEN`
- `XH_MODEL`，可选

单次命令也可以用模型前缀覆盖中转站，例如：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=ping --model=inferaichat:deepseek-v4-flash
```

### 数据库前置条件

两阶段抽取会把 document plan 保存到 `quote_agent.extraction_results.llm_plan_json`。

如果数据库还没有这个字段，先手动执行：

### 连通性测试

只测试当前中转站是否可用，不读写 productConfigAgent 业务表。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=ping
```

### 只生成 Document Plan

适合先给大量文件做规划：识别 document 中有几个 item、每个 item 的产品类型、文本范围和 item 之间关系。

这个模式只写入 `llm_plan_json`，状态为 `planned`，不会抽字段，也不会生成 dictionary candidate。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --limit=20000 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

只给单个 document 生成 plan：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --documentId=8 --promptVersion=v3-plan-item-20260616
```

强制重做 plan：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan --documentId=8 --promptVersion=v3-plan-item-20260616 --force
```

### 按已有 Plan 抽取 Item

读取状态为 `planned` 或 `planned_partial` 的 extraction，根据 `llm_plan_json` 抽取尚未抽过的 item。

抽完的 item 会在 plan 中标记 `extraction_status = "extracted"` 和 `extracted_at`，后续再次运行不会重复抽这些 item。

抽全部待抽 item：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item --limit=500 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

只抽某一种产品类型，例如分配器：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item --limit=500 --concurrency=10 --promptVersion=v3-plan-item-20260616 --productType=feedblock
```

`--mode=item` 是保守逐项抽取模式：脚本会按 extraction 逐个处理，每个 plan item 独立调用二阶段抽取。它适合排查问题或作为批量模式失败后的回退路径。

### 跨 Plan 批量抽取 Item

读取多个已完成 plan 的 extraction，把相同 `product_type_hint` 的待抽 item 合并成小批次一次调用 XH LLM，以减少重复 prompt 和 dictionary_context token。抽完后仍会按 extraction 分别回写 `extraction_json`、标记 `llm_plan_json.items[].extracted_at`，并逐 extraction 走 dictionary normalization。

原 `--mode=item` 会保留；新的省 token 模式需要显式使用 `--mode=item-batch`。两种模式都会跳过已经有 `extracted_at` 的 item。

跨 plan 批量抽全部产品类型，内部按 `product_type_hint` 分组：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item-batch --limit=500 --batchSize=5 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

只批量抽换网器/过滤器：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item-batch --productType=filter --limit=500 --batchSize=5 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

只批量抽定型模：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=item-batch --productType=sizing_die --limit=500 --batchSize=5 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

批量参数说明：

- `--batchSize=5` 表示一次 LLM call 最多包含 5 个 plan items，默认 5。
- `--concurrency=10` 表示并发执行 10 个 batch，不改变单个 batch 的 item 数。
- `--limit=500` 表示最多读取 500 个 planned/planned_partial extraction，和原 `--mode=item` 保持一致。
- 如果一个 batch 失败，脚本会自动拆半重试；拆到单个 item 仍失败时，只记录该 item 失败，不影响其它 item。

### 一条命令重做 Plan 并批量抽取 Item

适合无人值守过夜跑。脚本会按 `--limit` 分批筛选“最新 extraction 不完整”的文档强制重做 plan，每完成一批 plan 就自动循环执行 `item-batch`，直到这批没有待抽 item，再进入下一批 plan。整个流程会持续到没有需要重做 plan 的文档，或某一轮没有任何成功 plan/item 时停止以避免无限重试。

筛选规则：保留最新 extraction 状态为 `normalized` 或 `parsed` 且 `extraction_json` 不为空的文档；其它有 document blocks 的文档都会重做 stage1 plan。

在 `--mode=plan-item-batch` 中，`--limit` 表示每轮 stage1 plan 的批大小，不是整晚总量。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan-item-batch --limit=2000 --batchSize=5 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

如果只想先跑某一种产品类型的 stage2，可以加 `--productType`。注意 stage1 plan 仍会先按筛选规则重做，`productType` 只限制后续 item-batch：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=plan-item-batch --productType=filter --limit=2000 --batchSize=5 --concurrency=10 --promptVersion=v3-plan-item-20260616
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
- `sizing_die`：定型模
- `thickness_gauge`：测厚仪
- `manifold`：合流器
- `air_knife`：风刀 / 气刀 / 贴辊风刀 / 真空箱 / 负压箱
- `static_mixer`：静态混合器
- `spinneret_plate`：喷丝板 / 喷丝组件
- `monomer_extraction`：单体抽吸
- `ibc_cooling_unit`：IBC 气泡冷却单元
- `valve`：开车阀 / 换向阀
- `hot_air_pipe`：热风管道
- `insulation_cover`：保温罩
- `temperature_control_system`：控温系统
- `die_cart`：模具小车
- `unknown`：未识别类型

### 一步完成两阶段抽取

先 plan，再立刻按 item 抽取，最终走 dictionary normalization。

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=batch --limit=500 --concurrency=10 --promptVersion=v3-plan-item-20260616
```

快捷写法：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=batch --limit=500 --concurrency=10 --twoStage
```

### 单个 Document 完整抽取

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=one --documentId=8 --promptVersion=v3-plan-item-20260616
```

强制重抽：

```bash
node --loader ts-node/esm -r dotenv/config src/features/productConfigAgent/extraction/scripts/runXhLlmExtract.ts --mode=one --documentId=8 --promptVersion=v3-plan-item-20260616 --force
```

### 运行建议

- 先用 `--mode=plan --limit=20` 小批量检查 plan 质量。
- 大量导入时先跑 `--mode=plan --limit=20000 --concurrency=10`。
- 字典完善后，再按产品类型分批跑 `--mode=item --productType=<type>`。
- 如果希望减少二阶段 token，可以改用 `--mode=item-batch --productType=<type> --batchSize=5`；如果某批数据异常，再回退到 `--mode=item` 排查。
- 如果要无人值守跑“重做非完整 plan + 批量二阶段”，使用 `--mode=plan-item-batch`。
- `--mode=plan` 不会生成 candidate；`--mode=item`、`--mode=item-batch` 和 `--mode=batch` 会继续走 dictionary normalization，可能生成 candidate。
- 已经生成过 plan 的 document 默认不会重复 plan，除非加 `--force`。
- 已经抽过的 item 默认不会重复抽，会根据 `llm_plan_json.items[].extracted_at` 跳过。

### 重抽混填/错概念 Candidate 关联文档

先根据 Concept Resolver 对 `plastic_material` 和 `application` 给出的
`split_value` 证据筛选关联文档，并把文档标记为
`planned_needs_reextract`：

```bash
npm run product-config-agent:reextract-cross-concept -- --mode=mark
```

标记后直接用 InferAI 强制两阶段重抽、normalization、candidate recheck，并输出
pending candidate 前后数量：

```bash
npm run product-config-agent:reextract-cross-concept -- --mode=reextract --concurrency=1 --model=inferaichat:deepseek-v4-flash
```

如果 InferAI 无响应或中途失败，文档会保留
`dirty_reason=prompt_cross_concept_reextract`。恢复后只继续这些已标记文档：

```bash
npm run product-config-agent:reextract-cross-concept -- --mode=resume --concurrency=1 --model=inferaichat:deepseek-v4-flash
```

大量文档优先复用已有 document plan，只批量重跑 Stage 2 item：

```bash
npm run product-config-agent:reextract-cross-concept -- --mode=resume-batch --roundLimit=10 --batchSize=2 --concurrency=5 --model=inferaichat:deepseek-v4-flash
```

`roundLimit` 控制每轮最多处理多少个 staged extraction；每轮结束即落库，适合
InferAI 长时间批跑和中断续跑。

