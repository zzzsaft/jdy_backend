import "../../../config/env";
import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source";
import { requestXhChatJson, getXhModel, normalizeXhModel } from "../../../llm";
import { quoteAgentRepository } from "../db.service";
import { quoteAgentService } from "../service";

type Mode = "ping" | "one" | "batch";

type CliOptions = {
  mode: Mode;
  documentId?: number;
  limit: number;
  concurrency: number;
  model: string;
  forceReextract: boolean;
};

type BatchResult = {
  documentId: number;
  fileName?: string;
  status: "success" | "failed";
  extractionId?: number;
  itemCount?: number;
  warningCount?: number;
  candidateCount?: number;
  error?: string;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readNumber(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readOptions(): CliOptions {
  const mode = (readArg("mode") || process.env.XH_EXTRACT_MODE || "batch") as Mode;
  if (!["ping", "one", "batch"].includes(mode)) {
    throw new Error("--mode must be ping, one, or batch");
  }

  const documentIdRaw = readArg("documentId") || process.env.XH_EXTRACT_DOCUMENT_ID;
  const documentId = documentIdRaw ? Number(documentIdRaw) : undefined;
  if (documentId !== undefined && (!Number.isFinite(documentId) || documentId <= 0)) {
    throw new Error("--documentId must be a positive number");
  }

  return {
    mode,
    documentId,
    limit: readNumber("limit", Number(process.env.XH_EXTRACT_LIMIT || 100)),
    concurrency: Math.max(
      1,
      Math.min(16, readNumber("concurrency", Number(process.env.XH_EXTRACT_CONCURRENCY || 8))),
    ),
    model: getXhModel(readArg("model") || process.env.XH_MODEL),
    forceReextract: hasFlag("force") || process.env.XH_EXTRACT_FORCE === "1",
  };
}

async function initializeDatabase() {
  if (!PgDataSource.isInitialized) {
    await PgDataSource.initialize();
    BaseEntity.useDataSource(PgDataSource);
  }
}

async function runPing(options: CliOptions) {
  const content = await requestXhChatJson({
    model: options.model,
    purpose: "quote_agent_xh_ping",
    responseFormat: "json_object",
    maxTokens: 100,
    messages: [
      {
        role: "user",
        content: '只输出一个 JSON 对象：{"ok":true}',
      },
    ],
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        model: normalizeXhModel(options.model),
        content,
      },
      null,
      2,
    ),
  );
}

async function extractOne(documentId: number, options: CliOptions): Promise<BatchResult> {
  const result = await quoteAgentService.extractDocumentBlocksWithLlm({
    documentId,
    llmModel: options.model,
    forceReextract: options.forceReextract,
  });
  const summary = result.dictionary?.summary;
  return {
    documentId,
    fileName: result.document?.fileName,
    status: "success",
    extractionId: result.extraction?.id,
    itemCount: summary?.item_count,
    warningCount: summary?.warning_count,
    candidateCount:
      summary === undefined
        ? undefined
        : (summary.term_type_candidate_count ?? 0) +
          (summary.value_candidate_count ?? 0),
  };
}

async function runOne(options: CliOptions) {
  if (!options.documentId) {
    throw new Error("--documentId is required when --mode=one");
  }
  await initializeDatabase();
  const result = await extractOne(options.documentId, options);
  console.log(JSON.stringify(result, null, 2));
}

async function runBatch(options: CliOptions) {
  await initializeDatabase();
  const documents = await quoteAgentRepository.findDocumentsMissingExtraction({
    limit: options.limit,
  });
  const results: BatchResult[] = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < documents.length) {
      const document = documents[cursor++];
      const documentId = Number(document.id);
      try {
        const result = await extractOne(documentId, options);
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const failed: BatchResult = {
          documentId,
          fileName: document.fileName,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        results.push(failed);
        console.error(JSON.stringify(failed));
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, documents.length) },
      () => runWorker(),
    ),
  );

  const summary = {
    model: normalizeXhModel(options.model),
    limit: options.limit,
    concurrency: options.concurrency,
    total: documents.length,
    successCount: results.filter((item) => item.status === "success").length,
    failedCount: results.filter((item) => item.status === "failed").length,
  };
  console.log(JSON.stringify({ summary }, null, 2));
}

async function main() {
  const options = readOptions();
  if (options.mode === "ping") {
    await runPing(options);
    return;
  }
  if (options.mode === "one") {
    await runOne(options);
    return;
  }
  await runBatch(options);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (PgDataSource.isInitialized) {
      await PgDataSource.destroy();
    }
  });
