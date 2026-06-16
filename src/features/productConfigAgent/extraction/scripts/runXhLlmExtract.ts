import "../../../../config/env.js";
import "reflect-metadata";
import { fileURLToPath } from "url";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../../config/data-source.js";
import { requestXhChatJson, getXhModel, normalizeXhModel } from "../../../../llm/index.js";
import { productConfigAgentRepository } from "../../db.service.js";
import { productConfigAgentService } from "../../service.js";

type Mode =
  | "ping"
  | "one"
  | "batch"
  | "plan"
  | "item"
  | "item-batch"
  | "plan-item-batch";

type CliOptions = {
  mode: Mode;
  documentId?: number;
  limit: number;
  concurrency: number;
  batchSize: number;
  model: string;
  promptVersion?: string;
  productType?: string;
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
  if (!["ping", "one", "batch", "plan", "item", "item-batch", "plan-item-batch"].includes(mode)) {
    throw new Error("--mode must be ping, one, batch, plan, item, item-batch, or plan-item-batch");
  }

  const documentIdRaw = readArg("documentId") || process.env.XH_EXTRACT_DOCUMENT_ID;
  const documentId = documentIdRaw ? Number(documentIdRaw) : undefined;
  if (documentId !== undefined && (!Number.isFinite(documentId) || documentId <= 0)) {
    throw new Error("--documentId must be a positive number");
  }

  const promptVersion =
    readArg("promptVersion") ||
    process.env.XH_EXTRACT_PROMPT_VERSION ||
    (hasFlag("twoStage") ||
    mode === "plan" ||
    mode === "item" ||
    mode === "item-batch" ||
    mode === "plan-item-batch"
      ? "v3-plan-item-20260616"
      : undefined);

  return {
    mode,
    documentId,
    limit: readNumber("limit", Number(process.env.XH_EXTRACT_LIMIT || 100)),
    concurrency: Math.max(
      1,
      Math.min(16, readNumber("concurrency", Number(process.env.XH_EXTRACT_CONCURRENCY || 10))),
    ),
    batchSize: Math.max(
      1,
      Math.min(20, readNumber("batchSize", Number(process.env.XH_EXTRACT_BATCH_SIZE || 5))),
    ),
    model: getXhModel(readArg("model") || process.env.XH_MODEL),
    promptVersion,
    productType: readArg("productType") || process.env.XH_EXTRACT_PRODUCT_TYPE,
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
    purpose: "product_config_agent_xh_ping",
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
  const result = await productConfigAgentService.extractDocumentBlocksWithLlm({
    documentId,
    llmModel: options.model,
    promptVersion: options.promptVersion,
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
  const documents = await productConfigAgentRepository.findDocumentsMissingExtraction({
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
    promptVersion: options.promptVersion ?? "default",
    limit: options.limit,
    concurrency: options.concurrency,
    total: documents.length,
    successCount: results.filter((item) => item.status === "success").length,
    failedCount: results.filter((item) => item.status === "failed").length,
  };
  console.log(JSON.stringify({ summary }, null, 2));
}

async function planOne(documentId: number, options: CliOptions): Promise<BatchResult> {
  const result = await productConfigAgentService.planDocumentBlocksWithLlm({
    documentId,
    llmModel: options.model,
    promptVersion: options.promptVersion,
    forceReplan: options.forceReextract,
  });
  return {
    documentId,
    fileName: result.document?.fileName,
    status: "success",
    extractionId: result.extraction?.id,
    itemCount: Array.isArray(result.plan?.items) ? result.plan.items.length : 0,
    warningCount: Array.isArray(result.plan?.warnings)
      ? result.plan.warnings.length
      : 0,
  };
}

async function runPlan(options: CliOptions) {
  await initializeDatabase();
  const documents = options.documentId
    ? [await productConfigAgentRepository.findDocumentById(options.documentId)].filter(Boolean)
    : await productConfigAgentRepository.findDocumentsMissingPlan({
        limit: options.limit,
        promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
        dictionaryVersion: 1,
        llmModel: options.model,
      });
  const results: BatchResult[] = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < documents.length) {
      const document = documents[cursor++];
      const documentId = Number(document.id);
      try {
        const result = await planOne(documentId, options);
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

  console.log(
    JSON.stringify(
      {
        summary: {
          mode: "plan",
          model: normalizeXhModel(options.model),
          promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
          limit: options.limit,
          concurrency: options.concurrency,
          total: documents.length,
          successCount: results.filter((item) => item.status === "success").length,
          failedCount: results.filter((item) => item.status === "failed").length,
        },
      },
      null,
      2,
    ),
  );
}

async function itemOne(
  extractionResultId: number,
  options: CliOptions,
): Promise<BatchResult & { skipped?: boolean; allItemsExtracted?: boolean }> {
  const result = await productConfigAgentService.extractPlannedItemsWithLlm({
    extractionResultId,
    llmModel: options.model,
    itemProductType: options.productType,
  });
  if (result.skipped) {
    return {
      documentId: Number(result.extraction?.documentId),
      fileName: result.document?.fileName,
      status: "success",
      extractionId: result.extraction?.id,
      skipped: true,
      error: result.reason,
    };
  }
  const summary = result.dictionary?.summary;
  return {
    documentId: Number(result.document?.id),
    fileName: result.document?.fileName,
    status: "success",
    extractionId: result.extraction?.id,
    itemCount: result.extractedItemCount,
    warningCount: summary?.warning_count,
    candidateCount:
      summary === undefined
        ? undefined
        : (summary.term_type_candidate_count ?? 0) +
          (summary.value_candidate_count ?? 0),
    allItemsExtracted: result.allItemsExtracted,
  };
}

async function runItem(options: CliOptions) {
  await initializeDatabase();
  const extractions = await productConfigAgentRepository.findPlannedExtractions({
    limit: options.limit,
    promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
    dictionaryVersion: 1,
    llmModel: options.model,
    productType: options.productType,
  });
  const results: Array<BatchResult & { skipped?: boolean }> = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < extractions.length) {
      const extraction = extractions[cursor++];
      try {
        const result = await itemOne(Number(extraction.id), options);
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        const failed: BatchResult = {
          documentId: Number(extraction.documentId),
          status: "failed",
          extractionId: Number(extraction.id),
          error: error instanceof Error ? error.message : String(error),
        };
        results.push(failed);
        console.error(JSON.stringify(failed));
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, extractions.length) },
      () => runWorker(),
    ),
  );

  console.log(
    JSON.stringify(
      {
        summary: {
          mode: "item",
          model: normalizeXhModel(options.model),
          promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
          productType: options.productType ?? "all",
          limit: options.limit,
          concurrency: options.concurrency,
          total: extractions.length,
          successCount: results.filter((item) => item.status === "success").length,
          skippedCount: results.filter((item) => item.skipped).length,
          failedCount: results.filter((item) => item.status === "failed").length,
        },
      },
      null,
      2,
    ),
  );
}

async function runItemBatch(options: CliOptions) {
  await initializeDatabase();
  const result = await productConfigAgentService.extractPlannedItemsBatchWithLlm({
    llmModel: options.model,
    promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
    dictionaryVersion: 1,
    itemProductType: options.productType,
    limit: options.limit,
    batchSize: options.batchSize,
    concurrency: options.concurrency,
  });

  for (const item of result.results ?? []) {
    console.log(JSON.stringify(item));
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          mode: "item-batch",
          model: normalizeXhModel(options.model),
          promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
          productType: options.productType ?? "all",
          limit: options.limit,
          batchSize: options.batchSize,
          concurrency: options.concurrency,
          batchCount: result.batchCount,
          itemCount: result.itemCount,
          successItemCount: result.successItemCount,
          failedItemCount: result.failedItemCount,
          updatedExtractionCount: result.updatedExtractionCount,
          skipped: result.skipped,
        },
      },
      null,
      2,
    ),
  );
}

async function runPlanItemBatch(options: CliOptions) {
  await initializeDatabase();
  const planOptions = {
    ...options,
    forceReextract: true,
  };
  const planResults: BatchResult[] = [];
  const itemRoundSummaries: any[] = [];
  let planRound = 0;
  let itemRound = 0;
  let stopReason = "completed";

  while (true) {
    planRound += 1;
    const documents = options.documentId
      ? [await productConfigAgentRepository.findDocumentById(options.documentId)].filter(Boolean)
      : await productConfigAgentRepository.findDocumentsNeedingPlanRefresh({
          limit: options.limit,
          promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
          dictionaryVersion: 1,
          llmModel: options.model,
        });

    if (!documents.length) {
      stopReason = "no_documents_needing_plan_refresh";
      break;
    }

    const planRoundResults: BatchResult[] = [];
    let cursor = 0;
    const runPlanWorker = async () => {
      while (cursor < documents.length) {
        const document = documents[cursor++];
        const documentId = Number(document.id);
        try {
          const result = await planOne(documentId, planOptions);
          planResults.push(result);
          planRoundResults.push(result);
          console.log(JSON.stringify({ stage: "plan", planRound, ...result }));
        } catch (error) {
          const failed: BatchResult = {
            documentId,
            fileName: document.fileName,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          };
          planResults.push(failed);
          planRoundResults.push(failed);
          console.error(JSON.stringify({ stage: "plan", planRound, ...failed }));
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(options.concurrency, documents.length) },
        () => runPlanWorker(),
      ),
    );

    const planSuccessCount = planRoundResults.filter(
      (item) => item.status === "success",
    ).length;
    if (planSuccessCount === 0) {
      stopReason = "no_successful_plan_in_round";
      break;
    }

    while (true) {
      itemRound += 1;
      const result = await productConfigAgentService.extractPlannedItemsBatchWithLlm({
        llmModel: options.model,
        promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
        dictionaryVersion: 1,
        itemProductType: options.productType,
        limit: options.limit,
        batchSize: options.batchSize,
        concurrency: options.concurrency,
      });
      const summary = {
        stage: "item-batch",
        planRound,
        itemRound,
        productType: options.productType ?? "all",
        batchCount: result.batchCount,
        itemCount: result.itemCount,
        successItemCount: result.successItemCount,
        failedItemCount: result.failedItemCount,
        updatedExtractionCount: result.updatedExtractionCount,
        skipped: result.skipped,
      };
      itemRoundSummaries.push(summary);
      console.log(JSON.stringify(summary));

      if (result.skipped || result.itemCount === 0) {
        break;
      }
      if (result.successItemCount === 0) {
        stopReason = "no_successful_item_extraction_in_round";
        console.error(
          JSON.stringify({
            stage: "item-batch",
            planRound,
            itemRound,
            stopped: true,
            reason: "No successful item extraction in this round; stopping to avoid retry loop",
            failedItemCount: result.failedItemCount,
          }),
        );
        break;
      }
    }

    if (stopReason !== "completed") {
      break;
    }
    if (options.documentId) {
      stopReason = "single_document_complete";
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          mode: "plan-item-batch",
          model: normalizeXhModel(options.model),
          promptVersion: options.promptVersion ?? "v3-plan-item-20260616",
          productType: options.productType ?? "all",
          limit: options.limit,
          batchSize: options.batchSize,
          concurrency: options.concurrency,
          planRoundCount: planRound,
          planTotal: planResults.length,
          planSuccessCount: planResults.filter((item) => item.status === "success").length,
          planFailedCount: planResults.filter((item) => item.status === "failed").length,
          stopReason,
          itemRounds: itemRoundSummaries,
        },
      },
      null,
      2,
    ),
  );
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
  if (options.mode === "plan") {
    await runPlan(options);
    return;
  }
  if (options.mode === "item") {
    await runItem(options);
    return;
  }
  if (options.mode === "item-batch") {
    await runItemBatch(options);
    return;
  }
  if (options.mode === "plan-item-batch") {
    await runPlanItemBatch(options);
    return;
  }
  await runBatch(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
}

