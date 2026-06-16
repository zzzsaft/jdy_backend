# productConfigAgent API Reference

This document is the source-readable API reference for productConfigAgent backend routes.
It is intentionally kept near the productConfigAgent code because the backend feature module lives there.

Source route file: `src/features/productConfigAgent/routes/productConfigAgent.routes.ts`

## API Document Version

Current frontend contract version: `productConfigAgent.archive-v1.1`

Last updated: `2026-06-14`

Canonical route prefix: `/productConfigAgent`

Compatibility note: backend still exports the old `/quoteAgent` prefix for the same
route set. New React productConfigAgent frontend work should use `/productConfigAgent`.

## Frontend Change Notes

Changes since `productConfigAgent.archive-v1.0`:

- Use `GET /productConfigAgent/contracts/summary` for dashboard counts.
- Use `GET /productConfigAgent/contracts` for uploaded / normalized / archived list views.
- Before showing the archive action as safe, call `GET /productConfigAgent/contracts/:documentId/archive-readiness`.
- `POST /productConfigAgent/contracts/:documentId/archive` now accepts `force?: boolean`.
- Archived contracts are edited with `PATCH /productConfigAgent/contract-archives/:archiveId`; each save creates a new version.
- Item product-number bindings are edited with `PUT /productConfigAgent/contract-archives/:archiveId/items/:itemId/product-bindings`.
- Product configuration lookup uses `GET /productConfigAgent/product-configs/search?productNumber=...`.
- Candidate cluster review can prioritize field-name candidates with `GET /productConfigAgent/candidates/clusters?candidateType=term_type`.

Readiness behavior:

- `canArchive=true` means the normalized extraction can be archived directly.
- `forceRequired=true` means the frontend should require explicit reviewer confirmation before sending `force: true`.
- `blockers` include missing normalized items, field-name candidates, or missing current product number.
- `warnings` include value candidates or docInfo fallback conditions; warnings do not block archive by default.

## Conventions

- Base URL in local development is usually `http://localhost:<PORT>`.
- All JSON endpoints return HTTP 400 with `{ "error": "message" }` when validation fails.
- IDs are usually numeric strings in database entities, but route params use URL strings.
- Candidate status accepted by list/review helper endpoints: `pending`, `approved`, `rejected`.
- For batch candidate review, `deferCandidateRecheck=true` is recommended for large batches.

## Documents And Extraction

### `GET /productConfigAgent/contracts/summary`

Returns dashboard counts for the React productConfigAgent frontend.

Response:

```ts
{
  uploadedCount: number,
  normalizedCount: number,
  archivedCount: number
}
```

### `GET /productConfigAgent/contracts`

Lists uploaded, normalized, or archived contracts for the React productConfigAgent frontend.

Query:

```ts
{
  page?: number,
  pageSize?: number,
  status?: "uploaded" | "normalized" | "archived",
  q?: string,
  productNumber?: string,
  customerId?: string
}
```

Response:

```ts
{
  page: number,
  pageSize: number,
  total: number,
  items: Array<{
    documentId: number,
    archiveId: number | null,
    extractionResultId: number | null,
    fileName: string,
    status: string,
    productNumber?: string | null,
    contractNumber?: string | null,
    orderNumber?: string | null,
    customerId?: string | null,
    currentVersion?: number | null,
    updatedAt?: string | null,
    createdAt: string
  }>
}
```

### `POST /productConfigAgent/contracts/upload`

Uploads one quote document and runs parse, LLM extraction, and dictionary normalization.

Request:

- `multipart/form-data`
- file part must include a `filename`

Response:

```ts
{
  document: object,
  extraction: object,
  dictionary: object | undefined,
  items: unknown[],
  warnings: unknown[]
}
```

### `POST /productConfigAgent/documents/pending-llm-upload/start`

Starts a background job for pending LLM upload/extraction work.

Body:

```ts
{
  limit?: number,
  llmModel?: string,
  concurrency?: number
}
```

Response:

```ts
{ job: object }
```

### `GET /productConfigAgent/documents/pending-llm-upload/status`

Returns the current pending LLM upload job status.

Response:

```ts
{ job: object | null }
```

### `GET /productConfigAgent/contracts/:documentId`

Returns the parsed/normalized contract detail for one document.

Response: service result from `productConfigAgentService.getContract(documentId)`.

### `POST /productConfigAgent/contracts/:documentId/candidates/generate`

Runs dictionary generation/normalization for an existing document.

Response: service result from `productConfigAgentService.generateDictionaryForDocument(documentId)`.

### `POST /productConfigAgent/contracts/:documentId/archive`

Archives the latest normalized extraction for a document. This creates the archive,
archive items, initial product-number bindings, and version `v1`. The operation is
idempotent for the same `documentId + extractionResultId`.

Default behavior requires a normalized extraction with non-empty `items`, no field-name
candidate blockers, and an identifiable current product number. Value candidates are
returned as warnings only. If a reviewer decides to archive anyway, send `force: true`;
the readiness snapshot is stored in the version change summary.

Body:

```ts
{
  archivedBy?: string,
  reviewedBy?: string,
  force?: boolean
}
```

Response:

```ts
{
  archive: ContractArchiveDetail,
  latestVersion: ContractArchiveVersion | null,
  version?: ContractArchiveVersion
}
```

### `GET /productConfigAgent/contracts/:documentId/archive-readiness`

Checks whether the latest normalized extraction is ready for archive without creating
archive records.

Response:

```ts
{
  documentId: number,
  extractionResultId: number | null,
  canArchive: boolean,
  forceRequired: boolean,
  blockers: Array<{ type: string, message: string, details?: object }>,
  warnings: Array<{ type: string, message: string, details?: object }>,
  summary: {
    itemCount: number,
    termTypeCandidateCount: number,
    valueCandidateCount: number,
    productNumber: string | null,
    docInfoSource: "normalized_extraction_json" | "llm_plan_json" | "none"
  }
}
```

### `GET /productConfigAgent/extractions`

Also available as `GET /api/extractions`.

Query:

```ts
{
  page?: number,
  pageSize?: number,
  status?: string,
  q?: string
}
```

Response: service result from `productConfigAgentService.listExtractions(...)`.

### `GET /productConfigAgent/extractions/:documentId`

Also available as `GET /api/extractions/:documentId`.

Returns extraction detail for one document.

Response: service result from `productConfigAgentService.getExtractionDetail(documentId)`.

### `POST /productConfigAgent/extractions/:documentId/reextract`

Also available as `POST /api/extractions/:documentId/reextract`.

Re-runs LLM extraction for one document, then normalizes with dictionary.

Body:

```ts
{ llmModel?: string }
```

Response:

```ts
{
  document: object,
  extraction: object,
  dictionary: object,
  items: unknown[],
  warnings: unknown[],
  reusedBlocks: boolean,
  reusedExtraction: boolean
}
```

### `POST /productConfigAgent/extractions/:documentId/renormalize`

Also available as `POST /api/extractions/:documentId/renormalize`.

Re-runs dictionary normalization for one document without re-extracting from LLM.

Response: service result from `productConfigAgentService.generateDictionaryForDocument(documentId)`.

### `POST /productConfigAgent/extractions/renormalize-batch`

Batch re-runs dictionary normalization against the current dictionary without re-extracting from LLM.

Request:

```ts
{
  scope?: "all" | "missing_normalized" | "with_pending_candidates", // default: "all"
  limit?: number,                       // omit to process all matching rows
  batchSize?: number                    // default: 100, max: 500
}
```

Response:

```ts
{
  scope: "all" | "missing_normalized" | "with_pending_candidates",
  requestedLimit: number | null,
  batchSize: number,
  onlyMissingNormalized: boolean,
  withPendingCandidates: boolean,
  processedCount: number,
  successCount: number,
  failedCount: number,
  failedResults: Array<{
    extractionResultId: number,
    documentId: number,
    status: "failed",
    error: string
  }>,
  resultPreview: Array<{
    extractionResultId: number,
    documentId: number,
    status: "normalized" | "failed",
    error?: string
  }>
}
```

### Normalized `number_unit` fields

When a matched dictionary field has `valueKind = "number_unit"` and the value
starts with a number or numeric range, the normalized field includes
`dictionary.number_unit`.

Text-only values such as `按客户要求` are left as ordinary term-type-only values:
they do not include `dictionary.number_unit`, do not create unit candidates, and
do not emit number-unit parse warnings.

Example:

```ts
{
  raw_value: "3000-2000 公斤/H",
  dictionary: {
    value_kind: "number_unit",
    normalized_value: "3000-2000 kg/h",
    number_unit: {
      rawValue: "3000-2000 公斤/H",
      numericText: "3000-2000",
      numberKind: "range",              // "single" | "range"
      value?: string,                    // present for single number
      rangeStart?: string,               // preserves source order
      rangeEnd?: string,                 // preserves source order
      rangeMin?: string,                 // sorted numeric min
      rangeMax?: string,                 // sorted numeric max
      unitRaw?: string,
      normalizedUnitRaw?: string,
      unitCanonical?: string,
      displayUnit?: string,
      matchedAliasId?: string,
      normalizedValue: string,
      warnings: string[]
    }
  },
  candidate?: {
    candidate_type: "unit",
    candidate_id: string,
    term_type?: string,
    raw_value: string,
    raw_unit: string,
    status: string
  }
}
```

### `POST /productConfigAgent/documents/:documentId/open-file`

Opens the original uploaded file on the server machine.

Response:

```ts
{
  ok: true,
  documentId: number,
  fileName: string,
  filePath: string
}
```

## Contract Archives

Archived contracts are the editable business layer created from normalized
extractions. Editing archives never mutates the original extraction result.

### `GET /productConfigAgent/contract-archives`

Lists archived contracts.

Query:

```ts
{
  page?: number,
  pageSize?: number,
  q?: string,
  productNumber?: string, // fuzzy search against archive and item bindings
  customerId?: string     // exact search
}
```

### `GET /productConfigAgent/contract-archives/:archiveId`

Opens one archived contract for viewing or editing. The response includes
`docInfo`, `items`, each item's `productBindings`, and `currentVersion`.

Response:

```ts
{
  archive: ContractArchiveDetail,
  latestVersion: ContractArchiveVersion | null
}
```

### `PATCH /productConfigAgent/contract-archives/:archiveId`

Edits archived contract fields and appends a new version. Paths are dot-separated
paths in the returned archive snapshot, for example
`docInfo.product_number.value` or `items.0.fields.3.raw_value`.

Body:

```ts
{
  editedBy?: string,
  changes: Array<{
    path: string,
    value: unknown
  }>
}
```

### `GET /productConfigAgent/contract-archives/:archiveId/versions`

Lists version history.

Response:

```ts
{ versions: ContractArchiveVersion[] }
```

### `GET /productConfigAgent/contract-archives/:archiveId/versions/:version`

Returns one version with its full snapshot.

Response:

```ts
{
  version: ContractArchiveVersion & {
    snapshot: ContractArchiveDetail
  }
}
```

### `PUT /productConfigAgent/contract-archives/:archiveId/items/:itemId/product-bindings`

Replaces all product-number bindings for one archived item and appends a new
archive version. This supports one item mapping to multiple product numbers.

Body:

```ts
{
  editedBy?: string,
  bindings: Array<{
    productNumber: string,
    role?: "primary" | "component" | "spare_part" | "derived" | "unknown",
    quantity?: string | null,
    bindingSource?: "manual" | "erp" | "rule" | "document" | "inherited",
    confidence?: number | null,
    erpProductId?: string | null,
    erpParentProductNumber?: string | null,
    erpMatchStatus?: "unmatched" | "matched" | "ambiguous" | "manual",
    priceAmount?: string | number | null,
    priceCurrency?: string | null,
    priceSource?: "erp" | "quote_history" | "manual" | null,
    evidence?: unknown,
    note?: string | null
  }>
}
```

### `GET /productConfigAgent/product-configs/search`

Searches archived item configurations by product number. ERP fields are nullable
until an ERP adapter is connected or a binding is manually set. `includeErp` is
accepted as a reserved flag; current responses always return
`erpSearchEnabled: false` and only search local archive bindings.

Query:

```ts
{
  productNumber: string,
  customerId?: string,
  includeErp?: boolean
}
```

## Candidates

### `GET /productConfigAgent/candidates`

Lists term type and value candidates, with cached review suggestions attached.

Query:

```ts
{
  status?: "pending" | "approved" | "rejected",
  documentId?: number,
  recheckPendingCandidates?: "true",
  model?: string
}
```

Response:

```ts
{
  termTypeCandidates: Array<object & { reviewSuggestion: object | null }>,
  valueCandidates: Array<object & { reviewSuggestion: object | null }>,
  suggestions: {
    termTypeCandidateSuggestions: unknown[],
    valueCandidateSuggestions: unknown[]
  }
}
```

### `POST /productConfigAgent/candidates/suggestions/batch`

Generates LLM review suggestions for individual candidates.

Body:

```ts
{
  status?: "pending" | "approved" | "rejected",
  documentId?: number,
  model?: string,
  force?: boolean
}
```

Behavior:

- If `documentId` is provided, candidates are scoped to that document.
- If `force=false`, cached suggestions can be reused.

Response:

```ts
{
  termTypeCandidateSuggestions: unknown[],
  valueCandidateSuggestions: unknown[],
  generatedCount: number,
  cachedCount: number,
  model: string
}
```

## Candidate Clusters

Candidate clusters group repeated candidates across documents. They are not grouped by document.

### `GET /productConfigAgent/candidates/clusters`

Returns candidate clusters plus dictionary options needed by the review UI.

Query:

```ts
{
  status?: "pending" | "approved" | "rejected",
  candidateType?: "all" | "term_type" | "value",
  documentId?: number,
  limit?: number
}
```

Response:

```ts
{
  candidateClusters: CandidateCluster[],
  summary: {
    status: string,
    candidateType: "all" | "term_type" | "value",
    documentId: number | null,
    limit: number | null,
    clusterCount: number,
    termTypeClusterCount: number,
    valueClusterCount: number,
    returnedClusterCount: number
  },
  options: {
    productTypes: ProductType[],
    termTypes: TermType[],
    enumValues: EnumValue[],
    runPolicy: ClusterRunPolicy
  },

  // compatibility fields
  productTypes: ProductType[],
  termTypes: TermType[],
  enumValues: EnumValue[],
  priorDecisions: unknown[],
  runPolicy: ClusterRunPolicy
}
```

`CandidateCluster`:

```ts
{
  clusterId: string,
  readableClusterId: string,
  clusterLabel: string,
  clusterKey: string,
  candidateType: "term_type" | "value",
  candidateIds: string[],
  termType?: string,
  normalizedRawValue?: string,
  normalizedFieldName?: string,
  rawValueSamples: string[],
  rawFieldNameSamples: string[],
  normalizedFieldNameSamples: string[],
  sourceProductType: string,
  reason: string | null,
  occurrenceCount: number,
  documentCount: number,
  commonContexts: string[],
  sampleOccurrences: Array<{
    documentId: string,
    fileName: string | null,
    itemIndex: number | null,
    itemName: string | null,
    rawFieldName: string,
    rawValue: string | null
  }>
}
```

Cluster ID formats:

- `term_type:<normalizedFieldName>:<sourceProductType>:<reason>`
- `value:<termType>:<normalizedRawValue>:<sourceProductType>:<reason>`

Notes:

- Use `candidateType=term_type` to review field-name candidates first. These are the blockers for archive readiness.
- Use `candidateType=value` after term type candidates are mostly resolved.
- `clusterId` is URL-segment encoded internally for stable parsing, so Chinese text may appear as `%E5...`.
- Use `clusterLabel` or `readableClusterId` for UI display.
- Submit `clusterId` back to `POST /productConfigAgent/candidates/clusters/suggestions/batch`.

### `GET /productConfigAgent/candidates/clusters/review-prompt`

Returns a complete copy-ready prompt template for DeepSeek cluster-level review.

Response:

```ts
{
  prompt: string,
  promptTemplate: string,
  placeholders: {
    productTypes: string,
    termTypes: string,
    enumValues: string,
    candidateClusters: string,
    priorDecisions: string
  },
  systemPrompt: string,
  inputShape: object,
  outputShape: {
    suggestions: Array<{
      clusterId: string,
      recommendedAction: string,
      confidence: number,
      riskLevel: "low" | "medium" | "high",
      needsHumanReview: boolean,
      humanReviewSummary: string,
      reason: string,
      batchOperationsPreview: BatchReviewOperation[]
    }>
  }
}
```

Frontend can either:

- replace placeholders in `promptTemplate`, or
- display/copy `prompt` after filling selected `candidateClusters`.

### `GET /productConfigAgent/candidates/units/review-prompt`

Returns a complete copy-ready prompt template for AI review of pending
`number_unit` unit alias candidates.

The prompt explicitly tells the AI not to perform unit conversion. It should only
approve exact spelling/format aliases of the same unit, and should not reorder
numeric ranges.

Response:

```ts
{
  prompt: string,
  promptTemplate: string,
  placeholders: {
    unitAliases: string,
    unitCandidates: string
  },
  inputShape: object,
  outputShape: {
    suggestions: Array<{
      candidateId: string,
      recommendedAction: "approve" | "reject" | "needs_human_review",
      canonicalUnit: string | null,
      displayUnit: string | null,
      aliasValue: string | null,
      confidence: number,
      riskLevel: "low" | "medium" | "high",
      needsHumanReview: boolean,
      reason: string
    }>
  },
  applyPolicy: {
    approveEndpoint: "POST /productConfigAgent/candidates/units/:candidateId/approve",
    rejectEndpoint: "POST /productConfigAgent/candidates/units/:candidateId/reject",
    approveBody: string,
    rejectBody: string
  }
}
```

Frontend should fill `unitAliases` from
`GET /productConfigAgent/dictionary/unit-aliases` and `unitCandidates` from
`GET /productConfigAgent/candidates/units?status=pending`.

### `POST /productConfigAgent/candidates/clusters/suggestions/batch`

Generates LLM suggestions only for the clusters specified by request body `clusterIds`.
It must not scan all pending clusters.

Body:

```ts
{
  clusterIds: string[],
  status?: "pending" | "approved" | "rejected",
  model?: string,
  priorDecisions?: unknown[],
  runPolicy?: Partial<{
    confidenceThreshold: number,
    maxSuggestedAliases: number,
    allowSplitValue: boolean
  }>
}
```

Response:

```ts
{
  suggestions: Array<{
    clusterId: string,
    recommendedAction:
      | "create_term_type"
      | "approve_as_alias"
      | "create_value"
      | "move_to_other_term_type"
      | "split_value"
      | "reject"
      | "needs_human_review",
    confidence: number | null,
    riskLevel: "low" | "medium" | "high",
    needsHumanReview: boolean,
    humanReviewSummary: string,
    reason: string,
    batchOperationsPreview: BatchReviewOperation[]
  }>
}
```

`batchOperationsPreview` is intended to be directly submitted to:

`POST /productConfigAgent/candidates/reviews/batch`

after human confirmation.

## Dictionary Options

### `GET /productConfigAgent/dictionary/term-types`

Returns active dictionary term types.

Response:

```ts
{
  termTypes: Array<DictionaryTermType & {
    aliases: DictionaryTermTypeAlias[] // active aliases, excluding termType/displayName/quoteDisplayName self aliases
  }>
}
```

### `POST /productConfigAgent/dictionary/term-types`

Creates a dictionary term type. If an inactive row already exists for the same
`termType`, it is reactivated and updated.

Body:

```ts
{
  termType: string,
  displayName: string,
  quoteDisplayName?: string | null,
  description?: string | null,
  category?: string | null,
  valueKind?: "enum" | "enums" | "number" | "number_unit" | "text" | "boolean" | "date" | "number_or_boolean",
  sortOrder?: number,
  applicableProductTypes?: string[],
  isActive?: boolean
}
```

Response:

```ts
{ termType: DictionaryTermType }
```

### `PATCH /productConfigAgent/dictionary/term-types/:id`

Updates a dictionary term type by id. Fields are partial and use the same shape
as create.

Response:

```ts
{ termType: DictionaryTermType }
```

### `DELETE /productConfigAgent/dictionary/term-types/:id`

Soft deletes a dictionary term type by setting `isActive = false`.

Response:

```ts
{ termType: DictionaryTermType }
```

### `GET /productConfigAgent/dictionary/values`

Returns active dictionary terms/values.

Query:

```ts
{ termType?: string }
```

Response:

```ts
{
  values: Array<DictionaryTerm & {
    aliases: DictionaryAlias[] // active aliases, excluding canonicalValue/displayName self aliases
  }>
}
```

### `POST /productConfigAgent/dictionary/values`

Creates a dictionary value. If an inactive row already exists for the same
`termType + canonicalValue`, it is reactivated and updated.

Body:

```ts
{
  termType: string,
  canonicalValue: string,
  displayName?: string | null,
  description?: string | null,
  isActive?: boolean
}
```

Response:

```ts
{ value: DictionaryTerm }
```

### `PATCH /productConfigAgent/dictionary/values/:id`

Updates a dictionary value by id. Fields are partial and use the same shape as
create.

Response:

```ts
{ value: DictionaryTerm }
```

### `DELETE /productConfigAgent/dictionary/values/:id`

Soft deletes a dictionary value by setting `isActive = false`.

Response:

```ts
{ value: DictionaryTerm }
```

### `GET /productConfigAgent/dictionary/unit-aliases`

Returns number-unit aliases used by `valueKind = "number_unit"` normalization.

Response:

```ts
{
  aliases: Array<{
    id: string,
    canonicalUnit: string,       // machine canonical, e.g. "cm3/rev"
    displayUnit?: string | null, // UI display, e.g. "cm³/rev"
    aliasValue: string,          // source spelling, e.g. "cm³/rev"
    normalizedAlias: string,
    source: string,
    usageCount: number,
    note?: string | null,
    isActive: boolean
  }>
}
```

### `POST /productConfigAgent/dictionary/unit-aliases`

Creates or updates a unit alias by `normalizedAlias`, then bumps dictionary
version.

Body:

```ts
{
  canonicalUnit: string,
  displayUnit?: string | null,
  aliasValue: string,
  note?: string | null
}
```

Response:

```ts
{ alias: DictionaryUnitAlias }
```

### `PATCH /productConfigAgent/dictionary/unit-aliases/:id`

Updates a unit alias by id. Fields are partial and use the same shape as create,
plus `isActive`.

Response:

```ts
{ alias: DictionaryUnitAlias }
```

### `GET /productConfigAgent/dictionary/product-types`

Also available as `GET /api/dictionary/product-types`.

Returns product type options.

Response:

```ts
Array<{ canonicalValue: string, displayName: string }>
```

### `POST /productConfigAgent/master-data/model-binding`

Binds an extracted model field to master data.

Body:

```ts
{
  termType: "metering_pump_model" | "filter_model",
  documentId: string,
  extractionResultId: string,
  itemIndex: number,
  rawValue: string,
  source: string,
  masterDataId: string
}
```

Response: service result from `ProductConfigAgentMasterDataService.bindModel(...)`.

## Candidate Review Actions

Most single-candidate review endpoints call `productConfigAgentService.reviewCandidateAndRefresh`.
Common optional body fields:

```ts
{
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean,
  reviewedBy?: string
}
```

### `GET /productConfigAgent/candidates/units`

Returns unit alias candidates generated from `number_unit` fields whose unit text
did not match `dictionary_unit_aliases`.

Query:

```ts
{ status?: "pending" | "approved" | "rejected" } // default: "pending"
```

Response:

```ts
{
  candidates: Array<{
    id: string,
    documentId?: string | null,
    extractionResultId?: string | null,
    termType?: string | null,
    rawValue: string,
    rawUnit: string,
    normalizedRawUnit: string,
    proposedCanonicalUnit?: string | null,
    reason?: string | null,
    evidence?: unknown,
    status: "pending" | "approved" | "rejected" | string,
    reviewedBy?: string | null,
    reviewedAt?: string | null,
    createdAt: string,
    updatedAt: string
  }>
}
```

### `POST /productConfigAgent/candidates/units/:candidateId/approve`

Approves a unit candidate and creates or reuses a unit alias. This bumps the
dictionary version and marks the candidate's document/archive as
`dictionary_dirty`.

Body:

```ts
{
  canonicalUnit: string,
  displayUnit?: string | null,
  aliasValue?: string,     // defaults to candidate.rawUnit
  reviewedBy?: string
}
```

Response:

```ts
{
  candidate: DictionaryUnitCandidate,
  alias: DictionaryUnitAlias
}
```

### `POST /productConfigAgent/candidates/units/:candidateId/reject`

Rejects a unit candidate without changing alias rows.

Body:

```ts
{
  reason?: string,
  reviewedBy?: string
}
```

Response:

```ts
{ candidate: DictionaryUnitCandidate }
```

### `POST /productConfigAgent/candidates/reviews/batch`

Applies multiple candidate review operations.

Body:

```ts
{
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean,
  asyncReview?: boolean,
  operations: BatchReviewOperation[]
}
```

Set `asyncReview: true` (or query `?asyncReview=true`) for large batches. The
endpoint validates the request, enqueues a persistent `public.background_jobs`
job, and returns HTTP `202` immediately.

`BatchReviewOperation`:

```ts
{
  candidateType: "term_type" | "value",
  candidateId: string,
  action:
    | "create_term_type"
    | "approve_term_type_as_alias"
    | "mark_term_type_as_doc_info"
    | "create_value"
    | "approve_value_as_alias"
    | "split_value"
    | "move_value_to_other_term_type"
    | "update_term_type_value_kind"
    | "reject",
  payload: object
}
```

Response:

```ts
{
  results: Array<{
    candidateType: "term_type" | "value",
    candidateId: string,
    action: string,
    status: "ok" | "failed",
    result?: unknown,
    error?: string
  }>,
  affectedDocumentIds: number[],
  refreshResults?: unknown[],
  candidateRecheck?: unknown,
  candidateRecheckDeferred?: boolean
}
```

Async response:

```ts
{
  async: true,
  job: BackgroundJob
}
```

### `GET /productConfigAgent/jobs/:jobId`

Returns the queued/running/completed/failed persistent background job. Completed
candidate review jobs include `result`, which has the same shape as the
synchronous batch response.

### `POST /productConfigAgent/candidates/term-type/:candidateId/create-term-type`

Body:

```ts
{
  termType: string,
  displayName: string,
  quoteDisplayName?: string,
  description?: string,
  category?: string,
  sortOrder?: number,
  valueKind: string,
  aliasNames?: string[],
  valueCanonicalValue?: string,
  valueDisplayName?: string,
  valueAliasNames?: string[],
  applicableProductTypes?: string[],
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean
}
```

### `POST /productConfigAgent/candidates/term-type/:candidateId/suggest`

Generates a term type suggestion for one term type candidate.

Body:

```ts
{ model?: string, force?: boolean }
```

### `POST /productConfigAgent/candidates/term-type/:candidateId/approve-as-alias`

Body:

```ts
{
  termType: string,
  valueKind?: string,
  aliasNames?: string[],
  valueCanonicalValue?: string,
  valueDisplayName?: string,
  valueAliasNames?: string[],
  appendApplicableProductType?: boolean,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean
}
```

### `POST /productConfigAgent/candidates/term-type/:candidateId/mark-as-doc-info`

Marks a term type candidate as document-level information instead of a product
item field. The candidate is stored as `rejected` with reason
`document_info_field_not_product_term_type`.

Body:

```ts
{
  reviewedBy?: string,
  reason?: string,
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean
}
```

### `POST /productConfigAgent/candidates/value/:candidateId/create-value`

Body:

```ts
{
  canonicalValue: string,
  displayName?: string,
  aliasNames?: string[],
  values?: Array<{
    canonicalValue: string,
    displayName?: string,
    aliasNames?: string[]
  }>,
  suppressCandidateRawAlias?: boolean,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /productConfigAgent/candidates/value/:candidateId/approve-as-alias`

Body:

```ts
{
  termId: string,
  aliasNames?: string[],
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /productConfigAgent/candidates/value/:candidateId/update-term-type-kind`

Body:

```ts
{
  termType: string,
  valueKind: string,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /productConfigAgent/candidates/value/:candidateId/split-suggest`

Generates split suggestions for one value candidate.

Body:

```ts
{ model?: string, force?: boolean }
```

### `POST /productConfigAgent/candidates/value/:candidateId/split`

Body:

```ts
{
  splits: Array<{
    termType: string,
    rawValue: string
  }>,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /productConfigAgent/candidates/value/:candidateId/move-to-term-type`

Body:

```ts
{
  termType: string,
  rawValue: string,
  reason?: string,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /productConfigAgent/candidates/:type/:candidateId/reject`

Rejects a term type or value candidate.

Path:

- `type=value`
- `type=term-type`

Body:

```ts
{
  reason?: string,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean
}
```
