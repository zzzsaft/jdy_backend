# productConfigAgent Architecture

This feature is the product configuration table agent.

Use `productConfigAgent` for new code, APIs, prompts, docs, and frontend calls.
Do not introduce new `quoteAgent` names for product configuration work. The old
`quoteAgent` facade and `/quoteAgent` routes remain only as compatibility
shims.

## Naming

- New public API prefix: `/productConfigAgent`
- Legacy compatible API prefix: `/quoteAgent`
- New feature facade: `src/features/productConfigAgent/`
- Legacy compatibility facade: `src/features/quoteAgent/`
- Database schema currently remains `quote_agent` to avoid unnecessary data
  migration while the product configuration archive is still evolving.

Future real quote work should be implemented as a separate quote agent that
starts from a product configuration table and then applies ERP prices, historical
prices, discounts, and quote rules.

```text
natural language / uploaded file
  -> productConfigAgent
  -> product configuration table
  -> future quote/pricing agent
  -> quote
```

## Current Scope

`productConfigAgent` owns:

- product configuration extraction
- product configuration normalization
- dictionary and candidate review for configuration fields
- product configuration archive
- natural language to product configuration planning
- ERP product/master-data lookup when needed for configuration binding

`productConfigAgent` does not own:

- quote price calculation
- ERP price lookup
- discount strategy
- final quote generation

Those pricing responsibilities belong in the future quote agent.

## Agent Runtime

The runtime is intentionally split into planning, execution, and tools:

```text
agent/
  productConfigAgent.agent.ts
  planner.ts
  executor.ts
  types.ts

tools/
  searchCustomerConfigs.tool.ts
  searchIndustryConfigs.tool.ts
  searchSimilarConfigs.tool.ts
  getProductRules.tool.ts
  generateConfigDraft.tool.ts
  validateConfig.tool.ts
  saveProductConfig.tool.ts
  index.ts
```

The planner converts a user request into a structured plan. The executor only
executes tool names registered in `tools/index.ts`. LLM output should never call
databases or external systems directly.

## Stable First Tool Set

Keep the first tool set small and stable:

- `searchCustomerConfigs`: resolve customer wording when needed, then find that
  customer's historical/common/latest product configurations.
- `searchIndustryConfigs`: find common configurations and high-frequency fields
  for an industry and product type.
- `searchSimilarConfigs`: retrieve similar historical cases. RAG, vector search,
  and rerank are internal implementation details of this tool.
- `getProductRules`: get product field definitions, enums, constraints, and ERP
  product/master-data rules.
- `generateConfigDraft`: combine user intent, retrieval results, and product
  rules into a draft configuration. It also covers recommendation and field
  completion in the first version.
- `validateConfig`: check missing fields, invalid combinations, low-confidence
  fields, and warnings.
- `saveProductConfig`: persist a confirmed product configuration.

Do not add a new tool for every new user phrasing. Prefer updating the planner
prompt, the tool argument schema, or the internals of these tools. Add a new tool
only when there is a genuinely new external capability boundary such as ERP
price lookup, BOM expansion, stock check, delivery-date calculation, or final
quote generation.

## RAG And Rerank

RAG belongs inside `searchSimilarConfigs`. The planner should not know about
embedding tables, vector databases, or rerank models.

The expected internal retrieval flow is:

```text
structured filters
  -> vector / semantic recall
  -> optional rerank
  -> top similar configuration cases with evidence
```

Rerank is recommended eventually, but it should be an internal option of
`searchSimilarConfigs`, not a separate first-version agent tool.

## Frontend Migration Note

Frontend code should call `/productConfigAgent/...` for product configuration
work. Do not add new `/quoteAgent/...` calls in frontend code. Existing
`/quoteAgent/...` compatibility is backend-only migration support.

## Normalization

Normalization uses the current dictionary and deterministic rules to rebuild
`normalized_extraction_json` from existing `extraction_json`. It does not call
the extraction LLM.

### Full rerun

Always run a small batch first:

```powershell
npm run product-config-agent:normalize-full -- --scope=all --limit=5 --batch-size=2 --concurrency=2 --recheck-candidates=true --recheck-limit=5000
```

After checking those results, run all existing extractions with the latest
normalization code and dictionary:

```powershell
npm run product-config-agent:normalize-full -- --scope=all --batch-size=100 --concurrency=4 --recheck-candidates=true --recheck-limit=5000
```

The second command also rechecks pending candidates and marks values and field
names already handled by the current dictionary as `auto_resolved`.

Available scopes:

- `all`: every extraction that has `extraction_json`.
- `missing_normalized`: only rows without `normalized_extraction_json`.
- `outdated_dictionary`: rows normalized against an older dictionary version.
- `with_pending_candidates`: rows currently associated with pending candidates.

To rerun only rows with pending candidates:

```powershell
npm run product-config-agent:normalize-full -- --scope=with_pending_candidates --batch-size=100 --concurrency=4 --recheck-candidates=true --recheck-limit=5000
```

Equivalent environment variables are available for scheduled or background
runs:

```powershell
$env:QUOTE_AGENT_FULL_NORMALIZE_SCOPE='all'
Remove-Item Env:QUOTE_AGENT_FULL_NORMALIZE_LIMIT -ErrorAction SilentlyContinue
$env:QUOTE_AGENT_FULL_NORMALIZE_BATCH_SIZE='100'
$env:QUOTE_AGENT_FULL_NORMALIZE_CONCURRENCY='4'
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_CANDIDATES='1'
$env:QUOTE_AGENT_FULL_NORMALIZE_RECHECK_LIMIT='5000'
npm run product-config-agent:normalize-full
```

On macOS/Linux, use `export`/`unset` with the same environment variable names.

### HTTP rerun

When the backend is running locally:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:2001/productConfigAgent/extractions/renormalize-batch' `
  -ContentType 'application/json' `
  -Body '{"scope":"all","limit":5,"batchSize":2,"concurrency":2}'
```

The response includes `processedCount`, `successCount`, `failedCount`, failed
rows, and a short result preview. The CLI is preferred for a full rerun because
it can also perform candidate recheck in the same process.

### Normalization rules

Exception-style guards live under `normalization/rules/`:

- `documentInfoRules.ts`: moves document-level fields out of product items.
- `productRedirectRules.ts`: redirects high-confidence fields to the correct
  product item in the same extraction.
- `rangeBoundRules.ts`: merges min/max field variants into one range.
- `numberUnitPartRules.ts`: merges separated numeric and unit fields.
- `indexedInstanceRules.ts`: handles trailing item-instance indexes.
- `selectionSplitRules.ts`: normalizes selection markers and drops explicitly
  unselected options.
- `qualifierRules.ts`: attaches position, area, layer, and instance qualifiers
  and consolidates equivalent specialized term types.
- `extruderConfigRules.ts`: groups A/B/C/D host extruder model, material, and
  output text into qualified `extruder_model` fields.
- `layerConfigRules.ts`: normalizes composite layer/extruder configurations.
- `holeConfigRules.ts`: splits thermocouple and pressure-hole composites.

Rules run before or around dictionary matching. A rule that changes field
meaning must preserve original text and evidence so the result remains
auditable.
