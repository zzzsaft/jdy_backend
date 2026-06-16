import assert from "node:assert/strict";
import { PlannedExtractionService } from "./plannedExtraction.service.js";

function createService(params?: {
  extractions?: any[];
  documents?: Map<number, any>;
  blocks?: Map<number, any>;
  onUpdate?: (data: any) => void;
}) {
  const repository = {
    findDocumentById: async (documentId: number) =>
      params?.documents?.get(documentId) ?? { id: documentId, fileName: `doc-${documentId}.xlsx` },
    findBlocksByDocumentId: async (documentId: number) =>
      params?.blocks?.get(documentId) ?? {
        blocksJson: {
          llm_text: `document ${documentId} text`,
          blocks: [],
        },
      },
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
    generateDictionaryForExtraction: async () => ({
      extraction_json: {},
      summary: {},
    }),
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

await testCollectPendingBatchItemsFiltersExtractedAndProductType();
await testUpdateExtractionsFromBatchResultsWritesMultipleExtractions();

console.log("planned extraction service tests passed");
