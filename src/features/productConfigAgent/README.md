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
