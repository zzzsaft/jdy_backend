import assert from "node:assert/strict";
import {
  buildDuplicateDocumentReport,
  calculateDocumentContentHash,
  type DuplicateDocumentCandidate,
} from "../src/features/productConfigAgent/workflow/documentDuplicateAnalysis.js";

function candidate(
  data: Partial<DuplicateDocumentCandidate> & {
    documentId: number;
    fileName: string;
    fileHash: string;
  },
): DuplicateDocumentCandidate {
  return {
    documentId: data.documentId,
    fileName: data.fileName,
    fileHash: data.fileHash,
    filePath: data.filePath ?? `/tmp/${data.fileHash}.xlsx`,
    source: data.source ?? "test",
    status: data.status ?? "parsed_blocks",
    createdAt: data.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    blocksId: data.blocksId,
    blocksJson: data.blocksJson,
    latestExtractionId: data.latestExtractionId,
    latestExtractionStatus: data.latestExtractionStatus,
    latestExtractionCreatedAt: data.latestExtractionCreatedAt,
  };
}

const hashA = calculateDocumentContentHash({
  file_name: "a.xlsx",
  file_path: "/tmp/one/a.xlsx",
  llm_text: "产品型号：A\n数量：10",
});
const hashAFromDifferentSource = calculateDocumentContentHash({
  file_name: "a-copy.xlsx",
  file_path: "/tmp/two/a.xlsx",
  llm_text: "产品型号：A\n数量：10",
});
const hashB = calculateDocumentContentHash({
  llm_text: "产品型号：B\n数量：10",
});

assert.ok(hashA);
assert.equal(hashA, hashAFromDifferentSource);
assert.notEqual(hashA, hashB);

const hashFromBlocks = calculateDocumentContentHash({
  blocks: [
    {
      source: { sheet_name: "Sheet1", cell: "A1" },
      raw_text: "产品型号：A",
    },
    {
      source: { sheet_name: "Sheet1", cell: "A2" },
      raw_text: "数量：10",
    },
  ],
});
assert.ok(hashFromBlocks);

const sameContentReport = buildDuplicateDocumentReport([
  candidate({
    documentId: 3,
    fileName: "same.xlsx",
    fileHash: "hash-3",
    blocksId: 30,
    blocksJson: { llm_text: "same content" },
  }),
  candidate({
    documentId: 2,
    fileName: "same.xlsx",
    fileHash: "hash-2",
    blocksId: 20,
    blocksJson: { llm_text: "same content" },
    latestExtractionId: 200,
    latestExtractionStatus: "normalized",
  }),
]);

assert.equal(sameContentReport.length, 1);
assert.equal(sameContentReport[0].classification, "same_content");
assert.equal(sameContentReport[0].canonicalDocumentId, 2);
assert.deepEqual(sameContentReport[0].duplicateMappings, [
  {
    duplicateDocumentId: 3,
    canonicalDocumentId: 2,
    reason: "same_file_name_same_content",
    contentHash: sameContentReport[0].contentHash,
  },
]);
assert.equal("blocksJson" in sameContentReport[0].documents[0], false);

const differentContentReport = buildDuplicateDocumentReport([
  candidate({
    documentId: 10,
    fileName: "different.xlsx",
    fileHash: "hash-10",
    blocksId: 100,
    blocksJson: { llm_text: "content a" },
  }),
  candidate({
    documentId: 11,
    fileName: "different.xlsx",
    fileHash: "hash-11",
    blocksId: 110,
    blocksJson: { llm_text: "content b" },
  }),
]);

assert.equal(differentContentReport[0].classification, "different_content");
assert.equal(differentContentReport[0].duplicateMappings.length, 0);

const missingBlocksReport = buildDuplicateDocumentReport([
  candidate({
    documentId: 20,
    fileName: "missing.xlsx",
    fileHash: "hash-20",
    blocksId: 200,
    blocksJson: { llm_text: "content" },
  }),
  candidate({
    documentId: 21,
    fileName: "missing.xlsx",
    fileHash: "hash-21",
    blocksId: null,
    blocksJson: null,
  }),
]);

assert.equal(missingBlocksReport[0].classification, "missing_blocks");
assert.equal(missingBlocksReport[0].duplicateMappings.length, 0);

const mixedContentReport = buildDuplicateDocumentReport([
  candidate({
    documentId: 30,
    fileName: "mixed.xlsx",
    fileHash: "hash-30",
    blocksId: 300,
    blocksJson: { llm_text: "shared content" },
  }),
  candidate({
    documentId: 31,
    fileName: "mixed.xlsx",
    fileHash: "hash-31",
    blocksId: 310,
    blocksJson: { llm_text: "shared content" },
  }),
  candidate({
    documentId: 32,
    fileName: "mixed.xlsx",
    fileHash: "hash-32",
    blocksId: 320,
    blocksJson: { llm_text: "unique content" },
  }),
]);

assert.equal(
  mixedContentReport.some((group) => group.classification === "different_content"),
  true,
);
assert.equal(
  mixedContentReport.some(
    (group) =>
      group.classification === "same_content" &&
      group.duplicateMappings.length === 1,
  ),
  true,
);

console.log("productConfigAgentDocumentDuplicateAnalysis tests passed");
