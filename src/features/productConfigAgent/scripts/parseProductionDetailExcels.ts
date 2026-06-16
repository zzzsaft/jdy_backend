import "reflect-metadata";
import fs from "fs";
import os from "os";
import path from "path";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";

type ParseErrorRecord = {
  fileName: string;
  filePath: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
};

type ProcessSuccessRecord = {
  fileName: string;
  filePath: string;
  documentId?: number;
  documentStatus?: string;
  blocksId?: number;
  reusedBlocks: boolean;
};

type ScanSummary = {
  sourceDir: string;
  processedAt: string;
  batchSize: number;
  totalExcelFiles: number;
  selectedExcelFiles: number;
  startIndex: number;
  endIndex: number;
  successCount: number;
  errorCount: number;
  errorLogPath: string;
  summaryPath: string;
  successes: ProcessSuccessRecord[];
  errors: ParseErrorRecord[];
};

const DEFAULT_SOURCE_DIR = path.join(os.homedir(), "Documents", "生产明细单");
const DEFAULT_LOG_DIR = path.resolve(process.cwd(), "logs");
const DEFAULT_BATCH_SIZE = 200;

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isExcelFile(fileName: string) {
  return [".xls", ".xlsx"].includes(path.extname(fileName).toLowerCase());
}

async function collectExcelFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectExcelFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && isExcelFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

async function writeJsonl(filePath: string, records: unknown[]) {
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.promises.writeFile(filePath, content ? `${content}\n` : "", "utf8");
}

function getErrorStage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^\[((?:quoteAgent|productConfigAgent):[^\]]+)\]/);
  return match?.[1] ?? "unknown";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function secondsSince(startedAt: number) {
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function readPositiveIntArg(name: string, fallback: number) {
  const raw = readArg(name);
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return Math.floor(value);
}

function readOptionalPositiveIntArg(name: string) {
  const raw = readArg(name);
  if (raw === undefined || raw === "") return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return Math.floor(value);
}

function readSourceDir() {
  const positional = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--"));

  return path.resolve(readArg("sourceDir") || positional || DEFAULT_SOURCE_DIR);
}

async function initializeDatabase() {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }
}

async function main() {
  const sourceDir = readSourceDir();
  const startIndex = readPositiveIntArg("start", 1);
  const limit = readOptionalPositiveIntArg("limit");
  const batchSize = readPositiveIntArg("batchSize", DEFAULT_BATCH_SIZE);
  const processedAt = new Date();
  const fileStamp = timestampForFileName(processedAt);
  const errorLogPath = path.join(
    DEFAULT_LOG_DIR,
    `production-detail-excel-parse-blocks-errors-${fileStamp}.jsonl`
  );
  const summaryPath = path.join(
    DEFAULT_LOG_DIR,
    `production-detail-excel-parse-blocks-summary-${fileStamp}.json`
  );

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`扫描目录不存在: ${sourceDir}`);
  }

  await fs.promises.mkdir(DEFAULT_LOG_DIR, { recursive: true });
  await initializeDatabase();

  const { productConfigAgentService } = await import("../service.js");

  const allExcelFiles = await collectExcelFiles(sourceDir);
  const sliceStart = Math.min(startIndex - 1, allExcelFiles.length);
  const sliceEnd =
    limit === undefined
      ? allExcelFiles.length
      : Math.min(allExcelFiles.length, sliceStart + limit);
  const excelFiles = allExcelFiles.slice(sliceStart, sliceEnd);
  const successes: ProcessSuccessRecord[] = [];
  const errors: ParseErrorRecord[] = [];

  console.log(`扫描目录: ${sourceDir}`);
  console.log(`发现 Excel 文件数: ${allExcelFiles.length}`);
  console.log(
    `本次处理范围: ${sliceStart + 1}-${sliceEnd}/${allExcelFiles.length} ` +
      `selected=${excelFiles.length} batchSize=${batchSize}`
  );

  for (let index = 0; index < excelFiles.length; index += batchSize) {
    const batchFiles = excelFiles.slice(index, index + batchSize);
    const globalStart = sliceStart + index + 1;
    const globalEnd = globalStart + batchFiles.length - 1;
    const displayIndex = `${globalStart}-${globalEnd}/${allExcelFiles.length}`;
    const batchStartedAt = Date.now();
    console.log(`[${displayIndex}] parsing production detail excels...`);

    try {
      const result = await productConfigAgentService.parseAndSaveBlocksBatch(
        batchFiles.map((filePath) => ({
          filePath,
          fileName: path.basename(filePath),
          source: "production_detail_batch",
          forceReparse: false,
          parserOptions: {
            buildLlmText: true,
            includeRowBlocks: false,
            parseTextboxes: false,
            xlsMode: "direct-first",
          },
        }))
      );

      const batchSuccesses = result.successes.map((item) => ({
          fileName: item.fileName,
          filePath: item.filePath,
          documentId: item.document?.id,
          documentStatus: item.document?.status,
          blocksId: item.blocks?.id,
          reusedBlocks: item.reusedBlocks,
        }));
      successes.push(...batchSuccesses);
      errors.push(...result.errors);

      const reusedCount = batchSuccesses.filter((item) => item.reusedBlocks).length;
      console.log(
        `[${displayIndex}] done in ${secondsSince(batchStartedAt)}s ` +
          `success=${batchSuccesses.length} reused=${reusedCount} ` +
          `parsed=${batchSuccesses.length - reusedCount} errors=${result.errors.length}`
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      errors.push(
        ...batchFiles.map((filePath) => ({
          fileName: path.basename(filePath),
          filePath,
          stage: getErrorStage(error),
          errorCode: "QUOTE_AGENT_PARSE_BLOCKS_BATCH_FAILED",
          errorMessage,
        }))
      );
      console.log(
        `[${displayIndex}] failed in ${secondsSince(batchStartedAt)}s: ${errorMessage}`
      );
    }
  }

  const summary: ScanSummary = {
    sourceDir,
    processedAt: processedAt.toISOString(),
    batchSize,
    totalExcelFiles: allExcelFiles.length,
    selectedExcelFiles: excelFiles.length,
    startIndex: sliceStart + 1,
    endIndex: sliceEnd,
    successCount: successes.length,
    errorCount: errors.length,
    errorLogPath,
    summaryPath,
    successes,
    errors,
  };

  await writeJsonl(errorLogPath, errors);
  await fs.promises.writeFile(
    summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log(
    `完成。成功: ${summary.successCount}, 失败: ${summary.errorCount}`
  );
  console.log(`错误日志: ${errorLogPath}`);
  console.log(`汇总文件: ${summaryPath}`);

  if (PgDataSource.isInitialized) {
    await PgDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  if (PgDataSource.isInitialized) {
    PgDataSource.destroy().catch(() => undefined);
  }
  process.exitCode = 1;
});
