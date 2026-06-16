import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import {
  BlockParsingService,
  calculateFileSha256,
} from "../src/features/productConfigAgent/workflow/blockParsing.service.js";

type FakeDocument = {
  id: number;
  fileName: string;
  fileHash: string;
  filePath: string;
  source: string;
  status: string;
  createdAt: Date;
};

type FakeBlocks = {
  id: number;
  documentId: number;
  parserVersion: string;
  createdAt: Date;
  blocksJson?: unknown;
};

class FakeProductConfigAgentRepository {
  documentsByHash = new Map<string, FakeDocument>();
  blocksByDocumentId = new Map<number, FakeBlocks>();
  upsertRecords: Array<{
    documentId: number;
    blocksJson: unknown;
    parserVersion?: string;
  }> = [];
  nextDocumentId = 100;
  nextBlocksId = 1000;

  seedDocument(data: Partial<FakeDocument> & { fileHash: string }) {
    const document: FakeDocument = {
      id: data.id ?? this.nextDocumentId++,
      fileName: data.fileName ?? "seed.xlsx",
      fileHash: data.fileHash,
      filePath: data.filePath ?? "",
      source: data.source ?? "test",
      status: data.status ?? "uploaded",
      createdAt: data.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    };

    this.documentsByHash.set(document.fileHash, document);
    return document;
  }

  seedBlocks(data: Partial<FakeBlocks> & { documentId: number }) {
    const blocks: FakeBlocks = {
      id: data.id ?? this.nextBlocksId++,
      documentId: data.documentId,
      parserVersion: data.parserVersion ?? "v1",
      createdAt: data.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
      blocksJson: data.blocksJson,
    };

    this.blocksByDocumentId.set(blocks.documentId, blocks);
    return blocks;
  }

  async findDocumentParseStatesByHashes(fileHashes: string[]) {
    return fileHashes
      .map((fileHash) => {
        const document = this.documentsByHash.get(fileHash);
        if (!document) return null;

        const blocks = this.blocksByDocumentId.get(document.id);
        return {
          documentId: document.id,
          fileName: document.fileName,
          fileHash: document.fileHash,
          filePath: document.filePath,
          source: document.source,
          status: document.status,
          createdAt: document.createdAt,
          blocksId: blocks?.id ?? null,
          parserVersion: blocks?.parserVersion ?? null,
          blocksCreatedAt: blocks?.createdAt ?? null,
        };
      })
      .filter(Boolean);
  }

  async createDocuments(
    records: Array<{
      fileName?: string;
      fileHash: string;
      filePath: string;
      source?: string;
      status?: string;
    }>,
  ) {
    return records.map((record) =>
      this.seedDocument({
        fileName: record.fileName ?? "",
        fileHash: record.fileHash,
        filePath: record.filePath,
        source: record.source ?? "uploaded",
        status: record.status ?? "uploaded",
      }),
    );
  }

  async upsertBlocksMany(
    records: Array<{
      documentId: number;
      blocksJson: unknown;
      parserVersion?: string;
    }>,
  ) {
    this.upsertRecords.push(...records);

    return records.map((record) => {
      const blocks = this.seedBlocks({
        documentId: record.documentId,
        parserVersion: record.parserVersion ?? "v1",
        blocksJson: record.blocksJson,
      });

      return {
        id: blocks.id,
        documentId: blocks.documentId,
        parserVersion: blocks.parserVersion,
        createdAt: blocks.createdAt,
      };
    });
  }

  async updateDocumentsStatus(documentIds: number[], status: string) {
    const ids = new Set(documentIds.map(Number));
    for (const document of this.documentsByHash.values()) {
      if (ids.has(document.id)) document.status = status;
    }
  }

  async updateDocumentStatus(documentId: number, status: string) {
    await this.updateDocumentsStatus([documentId], status);
  }
}

function writeWorkbook(filePath: string, value: string) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([[value]]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-agent-batch-"));

try {
  const existingParsedPath = path.join(tempDir, "existing-parsed.xlsx");
  const missingBlocksPath = path.join(tempDir, "missing-blocks.xlsx");
  const newFilePath = path.join(tempDir, "new-file.xlsx");
  const duplicatePath = path.join(tempDir, "duplicate.xlsx");

  writeWorkbook(existingParsedPath, "already parsed");
  writeWorkbook(missingBlocksPath, "needs blocks");
  writeWorkbook(newFilePath, "new document");
  writeWorkbook(duplicatePath, "duplicate content");

  const existingParsedHash = await calculateFileSha256(existingParsedPath);
  const missingBlocksHash = await calculateFileSha256(missingBlocksPath);

  const repository = new FakeProductConfigAgentRepository();
  const existingDocument = repository.seedDocument({
    id: 1,
    fileHash: existingParsedHash,
    fileName: path.basename(existingParsedPath),
    filePath: existingParsedPath,
    status: "normalized",
  });
  const existingBlocks = repository.seedBlocks({
    id: 10,
    documentId: existingDocument.id,
    blocksJson: { shouldNotBeReturned: true },
  });
  const missingBlocksDocument = repository.seedDocument({
    id: 2,
    fileHash: missingBlocksHash,
    fileName: path.basename(missingBlocksPath),
    filePath: missingBlocksPath,
    status: "uploaded",
  });

  const service = new BlockParsingService(repository as any);
  const result = await service.parseAndSaveBlocksBatch([
    {
      filePath: existingParsedPath,
      fileName: path.basename(existingParsedPath),
      source: "test",
      forceReparse: false,
      parserOptions: { parseTextboxes: false },
    },
    {
      filePath: missingBlocksPath,
      fileName: path.basename(missingBlocksPath),
      source: "test",
      forceReparse: false,
      parserOptions: { parseTextboxes: false },
    },
    {
      filePath: newFilePath,
      fileName: path.basename(newFilePath),
      source: "test",
      forceReparse: false,
      parserOptions: { parseTextboxes: false },
    },
    {
      filePath: duplicatePath,
      fileName: path.basename(duplicatePath),
      source: "test",
      forceReparse: false,
      parserOptions: { parseTextboxes: false },
    },
    {
      filePath: duplicatePath,
      fileName: `copy-${path.basename(duplicatePath)}`,
      source: "test",
      forceReparse: false,
      parserOptions: { parseTextboxes: false },
    },
  ]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.successes.length, 5);
  assert.equal(repository.upsertRecords.length, 3);
  assert.equal(
    repository.upsertRecords.some(
      (record) => record.documentId === existingDocument.id,
    ),
    false,
  );
  assert.equal(
    repository.upsertRecords.some(
      (record) => record.documentId === missingBlocksDocument.id,
    ),
    true,
  );

  const existingSuccess = result.successes.find(
    (item) => item.filePath === existingParsedPath,
  );
  assert.equal(existingSuccess?.reusedBlocks, true);
  assert.equal(existingSuccess?.blocks?.id, existingBlocks.id);
  assert.equal("blocksJson" in existingSuccess!.blocks, false);

  const missingBlocksSuccess = result.successes.find(
    (item) => item.filePath === missingBlocksPath,
  );
  assert.equal(missingBlocksSuccess?.reusedBlocks, false);
  assert.equal(missingBlocksSuccess?.document.status, "parsed_blocks");

  const newFileSuccess = result.successes.find(
    (item) => item.filePath === newFilePath,
  );
  assert.equal(newFileSuccess?.reusedBlocks, false);
  assert.equal(newFileSuccess?.document.status, "parsed_blocks");

  const duplicateSuccesses = result.successes.filter(
    (item) => item.filePath === duplicatePath,
  );
  assert.equal(duplicateSuccesses.length, 2);
  assert.equal(
    duplicateSuccesses[0].document.id,
    duplicateSuccesses[1].document.id,
  );
  assert.equal(duplicateSuccesses[0].blocks.id, duplicateSuccesses[1].blocks.id);
  assert.equal(duplicateSuccesses[0].reusedBlocks, false);
  assert.equal(duplicateSuccesses[1].reusedBlocks, false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("productConfigAgent batch parse tests passed");
