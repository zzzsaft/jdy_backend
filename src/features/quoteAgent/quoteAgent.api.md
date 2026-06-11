# quoteAgent API Reference

This document is the source-readable API reference for quoteAgent backend routes.
It is intentionally kept near the quoteAgent code so humans and agents can load it directly.

Source route file: `src/features/quoteAgent/routes/quoteAgent.routes.ts`

## Conventions

- Base URL in local development is usually `http://localhost:<PORT>`.
- All JSON endpoints return HTTP 400 with `{ "error": "message" }` when validation fails.
- IDs are usually numeric strings in database entities, but route params use URL strings.
- Candidate status accepted by list/review helper endpoints: `pending`, `approved`, `rejected`.
- For batch candidate review, `deferCandidateRecheck=true` is recommended for large batches.

## Documents And Extraction

### `POST /quoteAgent/contracts/upload`

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

### `POST /quoteAgent/documents/pending-llm-upload/start`

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

### `GET /quoteAgent/documents/pending-llm-upload/status`

Returns the current pending LLM upload job status.

Response:

```ts
{ job: object | null }
```

### `GET /quoteAgent/contracts/:documentId`

Returns the parsed/normalized contract detail for one document.

Response: service result from `quoteAgentService.getContract(documentId)`.

### `POST /quoteAgent/contracts/:documentId/candidates/generate`

Runs dictionary generation/normalization for an existing document.

Response: service result from `quoteAgentService.generateDictionaryForDocument(documentId)`.

### `GET /quoteAgent/extractions`

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

Response: service result from `quoteAgentService.listExtractions(...)`.

### `GET /quoteAgent/extractions/:documentId`

Also available as `GET /api/extractions/:documentId`.

Returns extraction detail for one document.

Response: service result from `quoteAgentService.getExtractionDetail(documentId)`.

### `POST /quoteAgent/extractions/:documentId/reextract`

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

### `POST /quoteAgent/extractions/:documentId/renormalize`

Also available as `POST /api/extractions/:documentId/renormalize`.

Re-runs dictionary normalization for one document without re-extracting from LLM.

Response: service result from `quoteAgentService.generateDictionaryForDocument(documentId)`.

### `POST /quoteAgent/extractions/renormalize-batch`

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

### `POST /quoteAgent/documents/:documentId/open-file`

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

## Candidates

### `GET /quoteAgent/candidates`

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

### `POST /quoteAgent/candidates/suggestions/batch`

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

### `GET /quoteAgent/candidates/clusters`

Returns candidate clusters plus dictionary options needed by the review UI.

Query:

```ts
{
  status?: "pending" | "approved" | "rejected",
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
    documentId: number | null,
    limit: number | null,
    clusterCount: number
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

- `clusterId` is URL-segment encoded internally for stable parsing, so Chinese text may appear as `%E5...`.
- Use `clusterLabel` or `readableClusterId` for UI display.
- Submit `clusterId` back to `POST /quoteAgent/candidates/clusters/suggestions/batch`.

### `GET /quoteAgent/candidates/clusters/review-prompt`

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

### `POST /quoteAgent/candidates/clusters/suggestions/batch`

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

`POST /quoteAgent/candidates/reviews/batch`

after human confirmation.

## Dictionary Options

### `GET /quoteAgent/dictionary/term-types`

Returns active dictionary term types.

Response:

```ts
{ termTypes: DictionaryTermType[] }
```

### `POST /quoteAgent/dictionary/term-types`

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

### `PATCH /quoteAgent/dictionary/term-types/:id`

Updates a dictionary term type by id. Fields are partial and use the same shape
as create.

Response:

```ts
{ termType: DictionaryTermType }
```

### `DELETE /quoteAgent/dictionary/term-types/:id`

Soft deletes a dictionary term type by setting `isActive = false`.

Response:

```ts
{ termType: DictionaryTermType }
```

### `GET /quoteAgent/dictionary/values`

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

### `POST /quoteAgent/dictionary/values`

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

### `PATCH /quoteAgent/dictionary/values/:id`

Updates a dictionary value by id. Fields are partial and use the same shape as
create.

Response:

```ts
{ value: DictionaryTerm }
```

### `DELETE /quoteAgent/dictionary/values/:id`

Soft deletes a dictionary value by setting `isActive = false`.

Response:

```ts
{ value: DictionaryTerm }
```

### `GET /quoteAgent/dictionary/product-types`

Also available as `GET /api/dictionary/product-types`.

Returns product type options.

Response:

```ts
Array<{ canonicalValue: string, displayName: string }>
```

### `POST /quoteAgent/master-data/model-binding`

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

Response: service result from `QuoteAgentMasterDataService.bindModel(...)`.

## Candidate Review Actions

Most single-candidate review endpoints call `quoteAgentService.reviewCandidateAndRefresh`.
Common optional body fields:

```ts
{
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean,
  reviewedBy?: string
}
```

### `POST /quoteAgent/candidates/reviews/batch`

Applies multiple candidate review operations.

Body:

```ts
{
  refreshAffectedDocuments?: boolean,
  deferCandidateRecheck?: boolean,
  operations: BatchReviewOperation[]
}
```

`BatchReviewOperation`:

```ts
{
  candidateType: "term_type" | "value",
  candidateId: string,
  action:
    | "create_term_type"
    | "approve_term_type_as_alias"
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

### `POST /quoteAgent/candidates/term-type/:candidateId/create-term-type`

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

### `POST /quoteAgent/candidates/term-type/:candidateId/suggest`

Generates a term type suggestion for one term type candidate.

Body:

```ts
{ model?: string, force?: boolean }
```

### `POST /quoteAgent/candidates/term-type/:candidateId/approve-as-alias`

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

### `POST /quoteAgent/candidates/value/:candidateId/create-value`

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

### `POST /quoteAgent/candidates/value/:candidateId/approve-as-alias`

Body:

```ts
{
  termId: string,
  aliasNames?: string[],
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /quoteAgent/candidates/value/:candidateId/update-term-type-kind`

Body:

```ts
{
  termType: string,
  valueKind: string,
  reviewedBy?: string,
  refreshAffectedDocuments?: boolean
}
```

### `POST /quoteAgent/candidates/value/:candidateId/split-suggest`

Generates split suggestions for one value candidate.

Body:

```ts
{ model?: string, force?: boolean }
```

### `POST /quoteAgent/candidates/value/:candidateId/split`

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

### `POST /quoteAgent/candidates/value/:candidateId/move-to-term-type`

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

### `POST /quoteAgent/candidates/:type/:candidateId/reject`

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
