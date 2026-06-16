import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { productConfigAgentRepository } from "../db.service.js";
import {
  buildDuplicateDocumentReport,
  type DuplicateDocumentGroupReport,
} from "../workflow/documentDuplicateAnalysis.js";

const DEFAULT_LOG_DIR = path.resolve(process.cwd(), "logs");

function hasArg(name: string) {
  return process.argv.includes(`--${name}`);
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function initializeDatabase() {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }
}

function flattenMappings(report: DuplicateDocumentGroupReport[]) {
  return report.flatMap((group) => group.duplicateMappings);
}

function summarize(report: DuplicateDocumentGroupReport[]) {
  const sameContentGroups = report.filter(
    (group) => group.classification === "same_content",
  );
  const differentContentGroups = report.filter(
    (group) => group.classification === "different_content",
  );
  const missingBlocksGroups = report.filter(
    (group) => group.classification === "missing_blocks",
  );
  const duplicateMappings = flattenMappings(report);

  return {
    groupCount: report.length,
    sameContentGroupCount: sameContentGroups.length,
    differentContentGroupCount: differentContentGroups.length,
    missingBlocksGroupCount: missingBlocksGroups.length,
    duplicateMappingCount: duplicateMappings.length,
  };
}

async function parseMissingBlocks(report: DuplicateDocumentGroupReport[]) {
  const missingDocuments = report
    .filter((group) => group.classification === "missing_blocks")
    .flatMap((group) =>
      group.documents.filter(
        (document) => !document.blocksId && fs.existsSync(document.filePath),
      ),
    );

  if (missingDocuments.length === 0) {
    console.log("missing_blocks 中没有可从 filePath 重新解析的文件");
    return;
  }

  const { productConfigAgentService } = await import("../service.js");
  const result = await productConfigAgentService.parseAndSaveBlocksBatch(
    missingDocuments.map((document) => ({
      filePath: document.filePath,
      fileName: document.fileName,
      source: document.source ?? "production_detail_duplicate_report",
      forceReparse: false,
      parserOptions: {
        buildLlmText: true,
        includeRowBlocks: false,
        parseTextboxes: false,
        xlsMode: "direct-first",
      },
    })),
  );

  console.log(
    `parseMissing 完成: success=${result.successes.length} errors=${result.errors.length}`,
  );
  if (result.errors.length > 0) {
    console.log(`parseMissing errors sample: ${JSON.stringify(result.errors[0])}`);
  }
}

async function loadReport() {
  const candidates = await productConfigAgentRepository.findDuplicateDocumentCandidates();
  const hydratedCandidates = candidates.map((candidate) => ({
    ...candidate,
    blocksJson: candidate.llmText ? { llm_text: candidate.llmText } : undefined,
  }));
  const missingLlmTextDocumentIds = hydratedCandidates
    .filter((candidate) => candidate.blocksId && !candidate.blocksJson)
    .map((candidate) => Number(candidate.documentId));

  if (missingLlmTextDocumentIds.length > 0) {
    const blocks = await productConfigAgentRepository.findBlocksByDocumentIds(
      missingLlmTextDocumentIds,
    );
    const blocksByDocumentId = new Map(
      blocks.map((block) => [Number(block.documentId), block.blocksJson]),
    );

    for (const candidate of hydratedCandidates) {
      if (!candidate.blocksJson) {
        candidate.blocksJson = blocksByDocumentId.get(Number(candidate.documentId));
      }
    }
  }

  return buildDuplicateDocumentReport(hydratedCandidates);
}

async function main() {
  const apply = hasArg("apply");
  const parseMissing = hasArg("parseMissing");
  const processedAt = new Date();
  const reportPath = path.join(
    DEFAULT_LOG_DIR,
    `duplicate-production-detail-documents-${timestampForFileName(processedAt)}.json`,
  );

  await fs.promises.mkdir(DEFAULT_LOG_DIR, { recursive: true });
  await initializeDatabase();

  let report = await loadReport();
  if (parseMissing) {
    await parseMissingBlocks(report);
    report = await loadReport();
  }

  const summary = summarize(report);
  let appliedDuplicateMappingCount = 0;
  if (apply) {
    const mappings = flattenMappings(report);
    const saved = await productConfigAgentRepository.upsertDocumentDuplicates(
      mappings,
    );
    appliedDuplicateMappingCount = saved.length;
  }

  const output = {
    processedAt: processedAt.toISOString(),
    dryRun: !apply,
    parseMissing,
    appliedDuplicateMappingCount,
    summary,
    groups: report,
  };

  await fs.promises.writeFile(
    reportPath,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  console.log(`duplicate report written: ${reportPath}`);
  console.log(JSON.stringify({ ...summary, appliedDuplicateMappingCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
