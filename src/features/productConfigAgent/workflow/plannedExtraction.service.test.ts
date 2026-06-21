import assert from "node:assert/strict";
import { PlannedExtractionService } from "./plannedExtraction.service.js";

function createService(params?: {
  extractions?: any[];
  documents?: Map<number, any>;
  blocks?: Map<number, any>;
  onUpdate?: (data: any) => void;
  onDocumentStatus?: (documentId: number, status: string) => void;
  onNormalize?: () => void;
  disallowSingleFetch?: boolean;
}) {
  const repository = {
    findDocumentById: async (documentId: number) => {
      if (params?.disallowSingleFetch) throw new Error("single document fetch");
      return (
        params?.documents?.get(documentId) ?? {
          id: documentId,
          fileName: `doc-${documentId}.xlsx`,
        }
      );
    },
    findDocumentsByIds: async (documentIds: number[]) =>
      documentIds.map(
        (documentId) =>
          params?.documents?.get(documentId) ?? {
            id: documentId,
            fileName: `doc-${documentId}.xlsx`,
          },
      ),
    findBlocksByDocumentId: async (documentId: number) => {
      if (params?.disallowSingleFetch) throw new Error("single blocks fetch");
      return params?.blocks?.get(documentId) ?? {
        blocksJson: {
          llm_text: `document ${documentId} text`,
          blocks: [],
        },
      };
    },
    findBlocksByDocumentIds: async (documentIds: number[]) =>
      documentIds.map((documentId) => ({
        documentId,
        blocksJson: params?.blocks?.get(documentId)?.blocksJson ?? {
          llm_text: `document ${documentId} text`,
          blocks: [],
        },
      })),
    findPlannedExtractions: async () => params?.extractions ?? [],
    updateExtractionAfterLlm: async (data: any) => {
      params?.onUpdate?.(data);
      return {
        id: data.extractionResultId,
        documentId: 1,
        extractionJson: data.extractionJson,
        llmPlanJson: data.llmPlanJson,
        status: data.status,
      };
    },
    updateDocumentStatus: async (documentId: number, status: string) => {
      params?.onDocumentStatus?.(documentId, status);
    },
  };
  const dictionaryService = {
    getLlmDictionaryContext: async () => ({
      product_types: [
        { canonical_value: "filter", display_name: "过滤器", aliases: [] },
      ],
      term_types: [],
    }),
  };
  const normalizationRefreshService = {
    generateDictionaryForExtraction: async () => {
      params?.onNormalize?.();
      return {
        extraction_json: {},
        summary: {},
      };
    },
  };

  return new PlannedExtractionService(
    repository as any,
    dictionaryService as any,
    normalizationRefreshService as any,
  ) as any;
}

async function testCollectPendingBatchItemsFiltersExtractedAndProductType() {
  const service = createService();
  const items = await service.collectPendingBatchItems({
    productType: "filter",
    extractions: [
      {
        id: 10,
        documentId: 1,
        llmPlanJson: {
          items: [
            { item_index: 1, product_type_hint: "filter", extracted_at: "2026-06-16T00:00:00.000Z" },
            { item_index: 2, product_type_hint: "filter" },
            { item_index: 3, product_type_hint: "feedblock" },
          ],
        },
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].extractionResultId, 10);
  assert.equal(items[0].item.item_index, 2);
  assert.equal(items[0].productType, "filter");
}

async function testCollectPendingBatchItemsUsesBatchFetches() {
  const service = createService({ disallowSingleFetch: true });
  const items = await service.collectPendingBatchItems({
    extractions: [
      {
        id: 10,
        documentId: 1,
        llmPlanJson: { items: [{ item_index: 1, product_type_hint: "filter" }] },
      },
      {
        id: 20,
        documentId: 2,
        llmPlanJson: { items: [{ item_index: 1, product_type_hint: "filter" }] },
      },
    ],
  });

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item: any) => item.documentId),
    [1, 2],
  );
}

async function testUpdateExtractionsFromBatchResultsWritesMultipleExtractions() {
  const updates: any[] = [];
  const service = createService({ onUpdate: (data) => updates.push(data) });
  const extractionMap = new Map<number, any>([
    [
      10,
      {
        id: 10,
        documentId: 1,
        extractionJson: { items: [] },
        llmPlanJson: { items: [{ item_index: 1, product_type_hint: "filter" }] },
      },
    ],
    [
      20,
      {
        id: 20,
        documentId: 2,
        extractionJson: { items: [] },
        llmPlanJson: { items: [{ item_index: 1, product_type_hint: "filter" }] },
      },
    ],
  ]);
  const documentMap = new Map<number, any>([
    [1, { id: 1, fileName: "a.xlsx" }],
    [2, { id: 2, fileName: "b.xlsx" }],
  ]);

  const result = await service.updateExtractionsFromBatchResults({
    extractionMap,
    documentMap,
    successResults: [
      {
        documentId: 1,
        extractionResultId: 10,
        itemIndex: 1,
        result: {
          extraction: {
            items: [
              {
                item_index: 1,
                product_type_hint: { value: "filter" },
                raw_fields: [],
              },
            ],
          },
          warnings: [],
        },
      },
      {
        documentId: 2,
        extractionResultId: 20,
        itemIndex: 1,
        result: {
          extraction: {
            items: [
              {
                item_index: 1,
                product_type_hint: { value: "filter" },
                raw_fields: [],
              },
            ],
          },
          warnings: [],
        },
      },
    ],
  });

  assert.equal(result.updatedExtractionCount, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].llmPlanJson.items[0].extraction_status, "extracted");
  assert.ok(updates[0].llmPlanJson.items[0].extracted_at);
  assert.equal(updates[1].llmPlanJson.items[0].extraction_status, "extracted");
}

async function testBoundaryMismatchMarksItemForReextract() {
  const updates: any[] = [];
  const documentStatuses: Array<{ documentId: number; status: string }> = [];
  let normalizeCount = 0;
  const service = createService({
    onUpdate: (data) => updates.push(data),
    onDocumentStatus: (documentId, status) =>
      documentStatuses.push({ documentId, status }),
    onNormalize: () => {
      normalizeCount += 1;
    },
  });
  const extractionMap = new Map<number, any>([
    [
      30,
      {
        id: 30,
        documentId: 3,
        extractionJson: { items: [] },
        llmPlanJson: { items: [{ item_index: 2, product_type_hint: "filter" }] },
      },
    ],
  ]);
  const documentMap = new Map<number, any>([
    [3, { id: 3, fileName: "c.xlsx" }],
  ]);

  const result = await service.updateExtractionsFromBatchResults({
    extractionMap,
    documentMap,
    successResults: [
      {
        documentId: 3,
        extractionResultId: 30,
        itemIndex: 2,
        result: {
          extraction: {
            items: [],
          },
          warnings: [
            {
              type: "current_item_blocks_mismatch",
              message: "wrong item text",
              evidence: { item_index: 2 },
            },
          ],
        },
      },
    ],
  });

  assert.equal(result.updatedExtractionCount, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(updates[0].status, "planned_needs_reextract");
  assert.equal(updates[0].llmPlanJson.items[0].extraction_status, "needs_reextract");
  assert.equal(documentStatuses[0].status, "planned_needs_reextract");
  assert.equal(normalizeCount, 0);
}

async function testSuspectedPlanRangeWarningDoesNotDiscardValidItem() {
  const updates: any[] = [];
  let normalizeCount = 0;
  const service = createService({
    onUpdate: (data) => updates.push(data),
    onNormalize: () => {
      normalizeCount += 1;
    },
  });
  const extractionMap = new Map<number, any>([
    [
      31,
      {
        id: 31,
        documentId: 3,
        extractionJson: { items: [] },
        llmPlanJson: { items: [{ item_index: 2, product_type_hint: "filter" }] },
      },
    ],
  ]);
  const documentMap = new Map<number, any>([[3, { id: 3, fileName: "c.xlsx" }]]);

  const result = await service.updateExtractionsFromBatchResults({
    extractionMap,
    documentMap,
    successResults: [
      {
        documentId: 3,
        extractionResultId: 31,
        itemIndex: 2,
        result: {
          extraction: {
            items: [{ item_index: 2, product_type_hint: { value: "filter" }, raw_fields: [] }],
          },
          warnings: [
            {
              type: "plan_range_suspected_misaligned",
              message: "planner anchor was not found; original range was used",
              evidence: { item_index: 2 },
            },
          ],
        },
      },
    ],
  });

  assert.equal(result.failures.length, 0);
  assert.equal(updates[0].status, "parsed");
  assert.equal(updates[0].llmPlanJson.items[0].extraction_status, "extracted");
  assert.equal(normalizeCount, 1);
}

async function testDuplicateReturnedItemIndexesAreReindexedBeforeMerge() {
  const updates: any[] = [];
  const service = createService({ onUpdate: (data) => updates.push(data) });
  const extractionMap = new Map<number, any>([
    [
      40,
      {
        id: 40,
        documentId: 4,
        extractionJson: { items: [] },
        llmPlanJson: { items: [{ item_index: 1, product_type_hint: "filter" }] },
      },
    ],
  ]);
  const documentMap = new Map<number, any>([
    [4, { id: 4, fileName: "d.xlsx" }],
  ]);

  const result = await service.updateExtractionsFromBatchResults({
    extractionMap,
    documentMap,
    successResults: [
      {
        documentId: 4,
        extractionResultId: 40,
        itemIndex: 1,
        result: {
          extraction: {
            items: [
              {
                item_index: 1,
                product_type_hint: { value: "filter" },
                raw_fields: [{ field_name: "尺寸", value: "A", confidence: 0.9 }],
              },
              {
                item_index: 1,
                product_type_hint: { value: "filter" },
                raw_fields: [{ field_name: "尺寸", value: "B", confidence: 0.9 }],
              },
            ],
          },
          warnings: [],
        },
      },
    ],
  });

  assert.equal(result.updatedExtractionCount, 1);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(
    updates[0].extractionJson.items.map((item: any) => ({
      itemIndex: item.item_index,
      value: item.raw_fields[0].value,
    })),
    [
      { itemIndex: 1, value: "A" },
      { itemIndex: 2, value: "B" },
    ],
  );
  assert.equal(
    updates[0].warnings.some(
      (warning: any) => warning.type === "item_instance_split_from_indexed_fields",
    ),
    true,
  );
}

await testCollectPendingBatchItemsFiltersExtractedAndProductType();
await testCollectPendingBatchItemsUsesBatchFetches();
await testUpdateExtractionsFromBatchResultsWritesMultipleExtractions();
await testBoundaryMismatchMarksItemForReextract();
await testSuspectedPlanRangeWarningDoesNotDiscardValidItem();
await testDuplicateReturnedItemIndexesAreReindexedBeforeMerge();

console.log("planned extraction service tests passed");
