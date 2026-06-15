import assert from "node:assert/strict";
import { DictionaryCache } from "./dictionary.cache.js";
import { normalizeClusterReviewSuggestion } from "./dictionarySuggestion.helpers.js";
import { DictionarySuggestionService } from "./dictionarySuggestion.service.js";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryCandidateOccurrence,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryVersion,
} from "./entity/index.js";
import { Documents } from "../workflow/entity/documents.entity.js";
import { ExtractionResults } from "../extraction/entity/extractionResults.entity.js";

type Repo = {
  find?: (params?: unknown) => Promise<unknown[]>;
  findOne?: (params?: unknown) => Promise<unknown | null>;
  createQueryBuilder?: () => unknown;
};

class MemoryDataSource {
  readonly versionFindOneCalls: unknown[] = [];
  versionValue = 1;

  getRepository(entity: Function): Repo {
    if (entity === DictionaryCandidateOccurrence) {
      return { find: async () => [] };
    }
    if (entity === Documents) {
      return {
        find: async () => [
          { id: 101, fileName: "doc-a.pdf" },
          { id: 202, fileName: "doc-b.pdf" },
          { id: 303, fileName: "doc-c.pdf" },
        ],
      };
    }
    if (entity === ExtractionResults) {
      return { find: async () => [] };
    }
    if (entity === DictionaryVersion) {
      return {
        findOne: async (params) => {
          this.versionFindOneCalls.push(params);
          return { versionValue: this.versionValue };
        },
      };
    }
    if (entity === DictionaryTermType || entity === DictionaryTermTypeAlias) {
      return { find: async () => [] };
    }
    if (entity === DictionaryTerm) {
      return { find: async () => [] };
    }
    if (entity === DictionaryAlias) {
      return {
        find: async () => [],
        createQueryBuilder: () => ({
          innerJoinAndSelect: () => ({
            where: () => ({
              getMany: async () => [],
            }),
          }),
        }),
      };
    }
    return { find: async () => [], findOne: async () => null };
  }
}

function valueCandidate(params: Partial<DictionaryCandidate>): DictionaryCandidate {
  return {
    id: params.id ?? "1",
    documentId: params.documentId ?? null,
    extractionResultId: params.extractionResultId ?? null,
    itemIndex: params.itemIndex ?? null,
    sourceProductType: params.sourceProductType ?? "flat_die",
    termType: params.termType ?? "plastic_material",
    rawValue: params.rawValue ?? "PVC",
    normalizedRawValue: params.normalizedRawValue ?? "pvc",
    proposedCanonicalValue: null,
    proposedTermId: null,
    reason: params.reason ?? "value_no_match",
    evidence: params.evidence ?? null,
    confidence: null,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    proposedTerm: null,
  } as DictionaryCandidate;
}

function termTypeCandidate(
  params: Partial<import("./entity/index.js").DictionaryTermTypeCandidate>,
) {
  return {
    id: params.id ?? "1",
    sourceProductType: params.sourceProductType ?? "flat_die",
    documentId: params.documentId ?? null,
    extractionResultId: params.extractionResultId ?? null,
    itemIndex: params.itemIndex ?? null,
    rawFieldName: params.rawFieldName ?? "材料",
    normalizedFieldName: params.normalizedFieldName ?? "材料",
    rawValue: params.rawValue ?? null,
    proposedTermType: params.proposedTermType ?? null,
    reason: params.reason ?? "term_type_no_match",
    evidence: params.evidence ?? null,
    confidence: null,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function testCandidateClustersAreNotGroupedByDocument() {
  const dataSource = new MemoryDataSource();
  const service = new DictionarySuggestionService(dataSource as any);

  const clusters = await service.buildCandidateClusters({
    termTypeCandidates: [
      termTypeCandidate({ id: "11", documentId: "101" }) as any,
      termTypeCandidate({ id: "12", documentId: "202" }) as any,
    ],
    valueCandidates: [
      valueCandidate({ id: "21", documentId: "101" }),
      valueCandidate({ id: "22", documentId: "202" }),
      valueCandidate({
        id: "23",
        documentId: "303",
        rawValue: "PET",
        normalizedRawValue: "pet",
      }),
    ],
  });

  const valuePvcCluster = clusters.find(
    (cluster) =>
      cluster.candidateType === "value" &&
      cluster.normalizedRawValue === "pvc",
  );
  assert.ok(valuePvcCluster);
  assert.deepEqual(valuePvcCluster.candidateIds.sort(), ["21", "22"]);
  assert.equal(valuePvcCluster.documentCount, 2);
  assert.equal(valuePvcCluster.occurrenceCount, 2);

  const termTypeCluster = clusters.find(
    (cluster) => cluster.candidateType === "term_type",
  );
  assert.ok(termTypeCluster);
  assert.deepEqual(termTypeCluster.candidateIds.sort(), ["11", "12"]);
  assert.equal(termTypeCluster.documentCount, 2);
}

async function testDictionaryCacheReloadsWhenVersionChanges() {
  const dataSource = new MemoryDataSource();
  const cache = new DictionaryCache(dataSource as any, 60_000);
  (cache as any).loadedVersion = 1;
  (cache as any).lastLoadedAt = Date.now();
  dataSource.versionValue = 2;

  await cache.ensureFresh();

  assert.equal((cache as any).loadedVersion, 2);
  assert.ok(dataSource.versionFindOneCalls.length >= 2);
}

function testClusterSuggestionShapeAndOperationMapping() {
  const suggestion = normalizeClusterReviewSuggestion(
    {
      recommendedAction: "approve_as_alias",
      confidence: 0.91,
      riskLevel: "low",
      humanReviewSummary: "可作为别名",
      reason: "字段名语义一致",
      batchOperationsPreview: [
        {
          candidateType: "term_type",
          candidateId: "11",
          action: "approve_as_alias",
          payload: { termType: "model" },
        },
      ],
    },
    {
      clusterId: "term_type:%E5%9E%8B%E5%8F%B7:filter:term_type_no_match",
      readableClusterId: "term_type:型号:filter:term_type_no_match",
      clusterLabel: "字段候选 / 型号 / filter / term_type_no_match",
      clusterKey: "term_type\u0000型号\u0000filter\u0000term_type_no_match",
      candidateType: "term_type",
      candidateIds: ["11"],
      normalizedFieldName: "型号",
      rawValueSamples: ["GD-1"],
      rawFieldNameSamples: ["型号"],
      normalizedFieldNameSamples: ["型号"],
      sourceProductType: "filter",
      reason: "term_type_no_match",
      occurrenceCount: 1,
      documentCount: 1,
      commonContexts: [],
      sampleOccurrences: [],
    },
  );

  assert.equal(suggestion.clusterId, "term_type:%E5%9E%8B%E5%8F%B7:filter:term_type_no_match");
  assert.equal(suggestion.recommendedAction, "approve_as_alias");
  assert.equal(suggestion.confidence, 0.91);
  assert.equal(suggestion.riskLevel, "low");
  assert.equal(suggestion.needsHumanReview, false);
  assert.equal(suggestion.humanReviewSummary, "可作为别名");
  assert.equal(suggestion.reason, "字段名语义一致");
  assert.deepEqual(suggestion.batchOperationsPreview, [
    {
      candidateType: "term_type",
      candidateId: "11",
      action: "approve_term_type_as_alias",
      payload: { termType: "model" },
    },
  ]);
}

function testClusterSuggestionRejectsIncompatibleOperationPreview() {
  const suggestion = normalizeClusterReviewSuggestion(
    {
      recommendedAction: "move_to_other_term_type",
      confidence: 0.95,
      riskLevel: "low",
      humanReviewSummary: "错误地把字段候选当字段值迁移",
      reason: "模型输出了 value-only 动作",
      batchOperationsPreview: [
        {
          candidateType: "term_type",
          candidateId: "338",
          action: "move_to_other_term_type",
          payload: {
            termType: "heating_method",
            rawValue: "不锈钢加热棒",
          },
        },
      ],
    },
    {
      clusterId:
        "term_type:%E6%A8%A1%E5%A4%B4%E5%8A%A0%E7%83%AD%E6%96%B9%E5%BC%8F:flat_die:term_type_no_match",
      readableClusterId: "term_type:模头加热方式:flat_die:term_type_no_match",
      clusterLabel: "字段候选 / 模头加热方式 / flat_die / term_type_no_match",
      clusterKey: "term_type\u0000模头加热方式\u0000flat_die\u0000term_type_no_match",
      candidateType: "term_type",
      candidateIds: ["338"],
      normalizedFieldName: "模头加热方式",
      rawValueSamples: ["不锈钢加热棒"],
      rawFieldNameSamples: ["模头加热方式"],
      normalizedFieldNameSamples: ["模头加热方式"],
      sourceProductType: "flat_die",
      reason: "term_type_no_match",
      occurrenceCount: 25,
      documentCount: 25,
      commonContexts: [],
      sampleOccurrences: [],
    },
  );

  assert.equal(suggestion.recommendedAction, "needs_human_review");
  assert.equal(suggestion.needsHumanReview, true);
  assert.deepEqual(suggestion.batchOperationsPreview, []);
}

function testClusterReviewPromptIsCopyReady() {
  const service = new DictionarySuggestionService(new MemoryDataSource() as any);
  const prompt = service.getClusterBatchReviewPrompt();

  assert.equal(typeof prompt.prompt, "string");
  assert.ok(prompt.prompt.includes("candidateClusters"));
  assert.ok(prompt.prompt.includes('"suggestions"'));
  assert.ok(prompt.prompt.includes("needsHumanReview"));
  assert.ok(prompt.prompt.includes("batchOperationsPreview"));
  assert.ok(prompt.prompt.includes("/productConfigAgent/candidates/reviews/batch"));
  assert.ok(Array.isArray(prompt.outputShape.suggestions));
}

function testUnitCandidateReviewPromptIsCopyReady() {
  const service = new DictionarySuggestionService(new MemoryDataSource() as any);
  const prompt = service.getUnitCandidateReviewPrompt();

  assert.equal(typeof prompt.prompt, "string");
  assert.ok(prompt.prompt.includes("unitCandidates"));
  assert.ok(prompt.prompt.includes("unitAliases"));
  assert.ok(prompt.prompt.includes("Do not perform unit conversion"));
  assert.ok(prompt.prompt.includes('"suggestions"'));
  assert.ok(prompt.prompt.includes("candidateId"));
  assert.ok(prompt.prompt.includes("/productConfigAgent/candidates/units/:candidateId/approve"));
  assert.ok(Array.isArray(prompt.outputShape.suggestions));
}

async function main() {
  await testCandidateClustersAreNotGroupedByDocument();
  await testDictionaryCacheReloadsWhenVersionChanges();
  testClusterSuggestionShapeAndOperationMapping();
  testClusterSuggestionRejectsIncompatibleOperationPreview();
  testClusterReviewPromptIsCopyReady();
  testUnitCandidateReviewPromptIsCopyReady();
  console.log("dictionarySuggestion tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
