import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Request, Response } from "express";
import { PgDataSource } from "../../../config/data-source.js";
import { authService } from "../../../services/authService.js";
import {
  DictionaryAlias,
  DictionaryTerm,
  DictionaryTermTypeAlias,
  DictionaryTermType,
} from "../dictionary/entity/index.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { normalizeText } from "../dictionary/dictionary.utils.js";
import { DictionarySuggestionService } from "../dictionary/dictionarySuggestion.service.js";
import {
  isProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataService,
  type ProductConfigAgentMasterDataSource,
} from "../masterData.service.js";
import { createProductConfigAgentArchiveRoutes } from "../archive/contractArchive.routes.js";
import { productConfigAgentService } from "../service.js";
import { productConfigAgentRuntimeService } from "../agent/index.js";
import { productConfigAgentRepository } from "../db.service.js";
import {
  isLocalDevRoute,
  resolveUserIdOrLocalDev,
} from "../../shared/routeAuth.js";
import {
  optionalBoolean,
  optionalString,
  optionalStringArray,
  requireString,
  sendError,
} from "../utils/routeUtils.js";
import {
  normalizeTermTypeSplitRows,
  normalizeValueSplitRows,
} from "../utils/reviewSplits.js";

const uploadDir = path.join(process.cwd(), "uploads", "product-config-agent");
const legacyUploadDir = path.join(process.cwd(), "uploads", "quote-agent");
const dictionarySuggestionService = new DictionarySuggestionService(PgDataSource);
const dictionaryService = new DictionaryService(PgDataSource);
const masterDataService = new ProductConfigAgentMasterDataService(PgDataSource);
const execFileAsync = promisify(execFile);
const MAX_RENORMALIZE_LIMIT = 1000;
const MAX_RENORMALIZE_BATCH_SIZE = 100;
const MAX_DIRTY_REFRESH_LIMIT = 1000;
const MAX_DIRTY_REFRESH_BATCH_SIZE = 50;
const MAX_CLUSTER_IDS = 100;
const MAX_BATCH_REVIEW_OPERATIONS = 200;

type ProductConfigAgentRouteAction = (request: Request, response: Response) => Promise<void>;

async function getProductConfigAgentUserId(request: Request): Promise<string | null> {
  const resolvedUserId = (request as Request & { userId?: string }).userId;
  if (resolvedUserId) {
    return resolvedUserId;
  }
  return resolveUserIdOrLocalDev(request);
}

async function resolveExistingDocumentFilePath(filePath: string): Promise<string> {
  try {
    await fs.access(filePath);
    return filePath;
  } catch (error) {
    const relativeToLegacy = path.relative(legacyUploadDir, filePath);
    if (
      relativeToLegacy.startsWith("..") ||
      path.isAbsolute(relativeToLegacy)
    ) {
      throw error;
    }

    const migratedPath = path.join(uploadDir, relativeToLegacy);
    await fs.access(migratedPath);
    return migratedPath;
  }
}

function productConfigAgentAdminUserIds(): Set<string> {
  return new Set(
    String(
      process.env.PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS ??
        process.env.QUOTE_AGENT_ADMIN_USER_IDS ??
        "",
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function requireProductConfigAgentAdmin(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) {
    return true;
  }

  const adminUserIds = productConfigAgentAdminUserIds();
  if (adminUserIds.size === 0) {
    response.status(403).json({
      error:
        "PRODUCT_CONFIG_AGENT_ADMIN_USER_IDS is required for production productConfigAgent writes",
    });
    return false;
  }

  const user = await authService.verifyToken(request);
  if (!user?.userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!adminUserIds.has(user.userId)) {
    response.status(403).json({ error: "Forbidden" });
    return false;
  }
  (request as Request & { userId?: string }).userId = user.userId;
  return true;
}

export async function requireProductConfigAgentToken(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (isLocalDevRoute()) {
    return true;
  }

  const userId = await getProductConfigAgentUserId(request);
  if (!userId) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }
  (request as Request & { userId?: string }).userId = userId;
  return true;
}

function withProductConfigAgentAdmin(action: ProductConfigAgentRouteAction): ProductConfigAgentRouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentAdmin(request, response))) {
      return;
    }
    await action(request, response);
  };
}

function withProductConfigAgentToken(action: ProductConfigAgentRouteAction): ProductConfigAgentRouteAction {
  return async (request, response) => {
    if (!(await requireProductConfigAgentToken(request, response))) {
      return;
    }
    await action(request, response);
  };
}

function requirePositiveInt(value: unknown, name: string): number {
  const parsed = optionalPositiveInt(value, name);
  if (parsed === undefined) {
    throw new Error(`${name} is required`);
  }
  return parsed;
}

function assertMax(value: number, max: number, name: string): number {
  if (value > max) {
    throw new Error(`${name} must be <= ${max}`);
  }
  return value;
}

function normalizeApplicableProductTypes(value: unknown): string[] | undefined {
  const values = optionalStringArray(value);
  if (!values) return undefined;
  return [...new Set(values)];
}

function normalizeValueRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any) => ({
      canonicalValue: String(item?.canonicalValue ?? "").trim(),
      displayName: String(item?.displayName ?? "").trim() || undefined,
      aliasNames: optionalStringArray(item?.aliasNames),
    }))
    .filter((item) => item.canonicalValue);
}

function shouldRefreshAffectedDocuments(request: Request): boolean {
  return request.body?.refreshAffectedDocuments === true;
}

function shouldDeferCandidateRecheck(request: Request): boolean {
  return request.body?.deferCandidateRecheck === true;
}

function shouldRunCandidateReviewBatchAsync(request: Request): boolean {
  return (
    request.body?.asyncReview === true ||
    request.body?.async === true ||
    request.query?.asyncReview === "true" ||
    request.query?.async === "true"
  );
}

function optionalPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return Math.floor(numericValue);
}

function optionalInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`${name} must be a number`);
  }
  return Math.floor(numericValue);
}

function normalizeDictionaryValueKind(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const valueKind = String(value).trim();
  const allowed = new Set([
    "enum",
    "enums",
    "number",
    "number_unit",
    "text",
    "boolean",
    "date",
    "number_or_boolean",
  ]);
  if (!allowed.has(valueKind)) {
    throw new Error(`unsupported valueKind: ${valueKind}`);
  }
  return valueKind as any;
}

export function normalizeBatchReviewOperations(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("operations is required");
  }
  if (value.length > MAX_BATCH_REVIEW_OPERATIONS) {
    throw new Error(`operations length must be <= ${MAX_BATCH_REVIEW_OPERATIONS}`);
  }
  const allowedActions = new Set([
    "create_term_type",
    "approve_term_type_as_alias",
    "split_term_type",
    "create_value",
    "approve_value_as_alias",
    "split_value",
    "move_value_to_other_term_type",
    "update_term_type_value_kind",
    "mark_term_type_as_doc_info",
    "reject",
  ]);

  return value.map((item: any) => {
    const candidateType = String(item?.candidateType ?? "").trim();
    const action = String(item?.action ?? "").trim();
    if (candidateType !== "term_type" && candidateType !== "value") {
      throw new Error("candidateType must be term_type or value");
    }
    if (!allowedActions.has(action)) {
      throw new Error(`unsupported batch review action: ${action}`);
    }
    const termTypeActions = new Set([
      "create_term_type",
      "approve_term_type_as_alias",
      "split_term_type",
      "mark_term_type_as_doc_info",
      "reject",
    ]);
    const valueActions = new Set([
      "create_value",
      "approve_value_as_alias",
      "split_value",
      "move_value_to_other_term_type",
      "update_term_type_value_kind",
      "reject",
    ]);
    if (candidateType === "term_type" && !termTypeActions.has(action)) {
      throw new Error(`unsupported term_type batch review action: ${action}`);
    }
    if (candidateType === "value" && !valueActions.has(action)) {
      throw new Error(`unsupported value batch review action: ${action}`);
    }
    return {
      candidateType: candidateType as "term_type" | "value",
      candidateId: requireString(item?.candidateId, "candidateId"),
      action: action as any,
      payload: item?.payload ?? {},
    };
  });
}

function requireStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} is required`);
  }
  const values = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${name} is required`);
  }
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length > MAX_CLUSTER_IDS) {
    throw new Error(`${name} length must be <= ${MAX_CLUSTER_IDS}`);
  }
  return uniqueValues;
}

async function readRequestBuffer(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value: string | undefined) {
  const result: Record<string, string> = {};
  if (!value) return result;

  for (const part of value.split(";")) {
    const [key, raw] = part.trim().split("=");
    if (!key || raw === undefined) continue;
    result[key] = raw.replace(/^"|"$/g, "");
  }

  return result;
}

async function saveMultipartFile(request: Request) {
  const contentType = request.headers["content-type"] ?? "";
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new Error("multipart boundary is required");
  }

  const buffer = await readRequestBuffer(request);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryStart = buffer.indexOf(boundaryBuffer, cursor);
    if (boundaryStart < 0) break;

    const partStart = boundaryStart + boundaryBuffer.length;
    if (buffer.slice(partStart, partStart + 2).toString() === "--") break;

    const headerStart = partStart + 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd < 0) break;

    const headerText = buffer.slice(headerStart, headerEnd).toString("utf8");
    const headers = Object.fromEntries(
      headerText
        .split("\r\n")
        .map((line) => {
          const separator = line.indexOf(":");
          return [
            line.slice(0, separator).trim().toLowerCase(),
            line.slice(separator + 1).trim(),
          ];
        })
        .filter(([key]) => key),
    );
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const nextBoundary = buffer.indexOf(boundaryBuffer, headerEnd + 4);
    if (nextBoundary < 0) break;

    if (disposition.filename) {
      const originalName = path.basename(disposition.filename);
      const safeName = originalName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
      const fileName = `${Date.now()}-${safeName}`;
      const filePath = path.join(uploadDir, fileName);
      const bodyEnd = nextBoundary - 2;
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, buffer.slice(headerEnd + 4, bodyEnd));
      return { filePath, fileName: originalName };
    }

    cursor = nextBoundary;
  }

  throw new Error("file field is required");
}

const uploadContract = async (request: Request, response: Response) => {
  try {
    const uploaded = await saveMultipartFile(request);
    const result = await productConfigAgentService.process({
      filePath: uploaded.filePath,
      fileName: uploaded.fileName,
      source: "product_config_agent_upload",
      forceReparse: true,
      forceReextract: true,
    });
    response.json({
      document: result.document,
      extraction: result.extraction,
      dictionary: result.dictionary?.summary,
      items: result.dictionary?.items ?? [],
      warnings: result.dictionary?.warnings ?? [],
    });
  } catch (error) {
    sendError(response, error);
  }
};

const createAgentSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.createSession({
        ownerUserId: await getProductConfigAgentUserId(request),
        title: optionalString(request.body?.title),
        metadata:
          request.body?.metadata && typeof request.body.metadata === "object"
            ? request.body.metadata
            : {},
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const runProductConfigAgentNaturalLanguage = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.run({
        sessionId: optionalString(request.body?.sessionId) ?? undefined,
        message: requireString(request.body?.message, "message"),
        confirmed: request.body?.confirmed === true,
        referenceConfigId:
          optionalString(request.body?.referenceConfigId) ?? undefined,
        llmModel: optionalString(request.body?.llmModel) ?? undefined,
        ownerUserId: await getProductConfigAgentUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getAgentSession = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.getSessionDetail({
        sessionId: requireString(request.params.sessionId, "sessionId"),
        ownerUserId: await getProductConfigAgentUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getAgentGeneratedConfig = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.getGeneratedConfig({
        id: requireString(request.params.id, "id"),
        ownerUserId: await getProductConfigAgentUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const createAgentGeneratedConfigShareToken = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.createShareToken({
        id: requireString(request.params.id, "id"),
        ownerUserId: await getProductConfigAgentUserId(request),
        expiresInDays: optionalPositiveInt(
          request.body?.expiresInDays,
          "expiresInDays",
        ),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const revokeAgentGeneratedConfigShareToken = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.revokeShareToken({
        id: requireString(request.params.id, "id"),
        ownerUserId: await getProductConfigAgentUserId(request),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getSharedAgentGeneratedConfig = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentRuntimeService.getSharedGeneratedConfig(
        requireString(request.params.shareToken, "shareToken"),
      ),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const startPendingLlmUpload = async (request: Request, response: Response) => {
  try {
    const limit =
      request.body?.limit === undefined || request.body?.limit === ""
        ? undefined
        : Number(request.body.limit);
    const llmModel =
      typeof request.body?.llmModel === "string" && request.body.llmModel.trim()
        ? request.body.llmModel.trim()
        : undefined;
    const concurrency =
      request.body?.concurrency === undefined || request.body?.concurrency === ""
        ? undefined
        : Number(request.body.concurrency);

    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error("limit must be a positive number");
    }
    if (
      concurrency !== undefined &&
      (!Number.isFinite(concurrency) || concurrency <= 0)
    ) {
      throw new Error("concurrency must be a positive number");
    }

    const job = productConfigAgentService.startPendingLlmUploadJob({
      limit,
      llmModel,
      concurrency,
    });
    response.json({ job });
  } catch (error) {
    sendError(response, error);
  }
};

const getPendingLlmUploadStatus = async (
  _request: Request,
  response: Response
) => {
  try {
    response.json({ job: productConfigAgentService.getPendingLlmUploadJob() });
  } catch (error) {
    sendError(response, error);
  }
};

const startDirtyDataRefresh = async (request: Request, response: Response) => {
  try {
    const limit = assertMax(
      optionalPositiveInt(request.body?.limit, "limit") ?? 100,
      MAX_DIRTY_REFRESH_LIMIT,
      "limit",
    );
    const batchSize = assertMax(
      optionalPositiveInt(request.body?.batchSize, "batchSize") ?? 10,
      MAX_DIRTY_REFRESH_BATCH_SIZE,
      "batchSize",
    );
    const job = productConfigAgentService.startDirtyDataRefreshJob({
      limit,
      batchSize,
    });
    response.json({ job });
  } catch (error) {
    sendError(response, error);
  }
};

const getDirtyDataRefreshStatus = async (
  _request: Request,
  response: Response,
) => {
  try {
    response.json({ job: productConfigAgentService.getDirtyDataRefreshJob() });
  } catch (error) {
    sendError(response, error);
  }
};

const generateCandidates = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await productConfigAgentService.generateDictionaryForDocument(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const getContract = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await productConfigAgentService.getContract(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const listExtractions = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.listExtractions({
        page:
          typeof request.query.page === "string"
            ? Number(request.query.page)
            : undefined,
        pageSize:
          typeof request.query.pageSize === "string"
            ? Number(request.query.pageSize)
            : undefined,
        status:
          typeof request.query.status === "string" && request.query.status.trim()
            ? request.query.status.trim()
            : undefined,
        q:
          typeof request.query.q === "string" && request.query.q.trim()
            ? request.query.q.trim()
            : undefined,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getExtractionDetail = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await productConfigAgentService.getExtractionDetail(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const renormalizeExtraction = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await productConfigAgentService.generateDictionaryForDocument(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const renormalizeExtractionResult = async (
  request: Request,
  response: Response,
) => {
  try {
    const extractionResultId = Number(request.params.extractionResultId);
    if (!extractionResultId) throw new Error("extractionResultId is required");
    response.json(
      await productConfigAgentService.generateDictionaryForExtractionId(
        extractionResultId,
      ),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const renormalizeExtractionsBatch = async (
  request: Request,
  response: Response,
) => {
  try {
    const scope = String(request.body?.scope ?? "all").trim();
    if (!["all", "missing_normalized", "with_pending_candidates"].includes(scope)) {
      throw new Error(
        "scope must be all, missing_normalized, or with_pending_candidates",
      );
    }

    const limit = assertMax(
      requirePositiveInt(request.body?.limit, "limit"),
      MAX_RENORMALIZE_LIMIT,
      "limit",
    );
    const batchSize = assertMax(
      optionalPositiveInt(request.body?.batchSize, "batchSize") ?? MAX_RENORMALIZE_BATCH_SIZE,
      MAX_RENORMALIZE_BATCH_SIZE,
      "batchSize",
    );
    const concurrency = assertMax(
      optionalPositiveInt(request.body?.concurrency, "concurrency") ?? 1,
      16,
      "concurrency",
    );

    const targetCount = await productConfigAgentService.countRenormalizationTargets({
      onlyMissingNormalized: scope === "missing_normalized",
      withPendingCandidates: scope === "with_pending_candidates",
    });

    const result = await productConfigAgentService.renormalizeExistingExtractionsInBatches({
      limit,
      batchSize,
      concurrency,
      onlyMissingNormalized: scope === "missing_normalized",
      withPendingCandidates: scope === "with_pending_candidates",
    });

    response.json({
      scope,
      targetCount,
      plannedCount: Math.min(targetCount, limit),
      requestedLimit: result.requestedLimit,
      batchSize: result.batchSize,
      concurrency: result.concurrency,
      onlyMissingNormalized: result.onlyMissingNormalized,
      withPendingCandidates: result.withPendingCandidates,
      processedCount: result.processedCount,
      successCount: result.successCount,
      failedCount: result.failedCount,
      failedResults: result.results.filter((item) => item.status === "failed"),
      resultPreview: result.results.slice(0, 50),
    });
  } catch (error) {
    sendError(response, error);
  }
};

const reextractDocumentWithLlm = async (
  request: Request,
  response: Response,
) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    const llmModel =
      typeof request.body?.llmModel === "string" && request.body.llmModel.trim()
        ? request.body.llmModel.trim()
        : undefined;
    const result = await productConfigAgentService.reextractDocumentWithLlm({
      documentId,
      llmModel,
    });
    response.json({
      document: result.document,
      extraction: result.extraction,
      dictionary: result.dictionary,
      items: result.dictionary?.items ?? [],
      warnings: result.dictionary?.warnings ?? [],
      reusedBlocks: result.reusedBlocks,
      reusedExtraction: result.reusedExtraction,
    });
  } catch (error) {
    sendError(response, error);
  }
};

const openDocumentFile = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    const contract = await productConfigAgentService.getContract(documentId);
    const filePath = contract.document?.filePath;
    if (!filePath) {
      throw new Error(`Document file path not found: ${documentId}`);
    }
    const existingFilePath = await resolveExistingDocumentFilePath(filePath);

    if (process.platform === "darwin") {
      await execFileAsync("open", [existingFilePath]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", existingFilePath]);
    } else {
      await execFileAsync("xdg-open", [existingFilePath]);
    }

    response.json({
      ok: true,
      documentId,
      fileName: contract.document.fileName,
      filePath: existingFilePath,
    });
  } catch (error) {
    sendError(response, error);
  }
};

const getCandidates = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.query.status === "string" ? request.query.status : "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("status must be pending, approved, or rejected");
    }
    const documentId =
      typeof request.query.documentId === "string" && request.query.documentId
        ? Number(request.query.documentId)
        : undefined;
    const candidates = await productConfigAgentService.getCandidates({
      status,
      documentId:
        documentId !== undefined && Number.isFinite(documentId)
          ? documentId
          : undefined,
      recheckPendingCandidates: request.query.recheckPendingCandidates === "true",
    });
    const suggestions =
      await dictionarySuggestionService.getCachedBatchReviewSuggestions({
        termTypeCandidateIds: candidates.termTypeCandidates.map((item) =>
          String(item.id),
        ),
        valueCandidateIds: candidates.valueCandidates.map((item) =>
          String(item.id),
        ),
        model:
          typeof request.query.model === "string"
            ? request.query.model
            : undefined,
      });
    const termTypeSuggestionMap = new Map(
      suggestions.termTypeCandidateSuggestions.map((item: any) => [
        String(item.candidateId),
        item,
      ]),
    );
    const valueSuggestionMap = new Map(
      suggestions.valueCandidateSuggestions.map((item: any) => [
        String(item.candidateId),
        item,
      ]),
    );

    response.json({
      termTypeCandidates: candidates.termTypeCandidates.map((item) => ({
        ...item,
        reviewSuggestion: termTypeSuggestionMap.get(String(item.id)) ?? null,
      })),
      valueCandidates: candidates.valueCandidates.map((item) => ({
        ...item,
        reviewSuggestion: valueSuggestionMap.get(String(item.id)) ?? null,
      })),
      suggestions,
    });
  } catch (error) {
    sendError(response, error);
  }
};

const getDictionaryTermTypes = async (_request: Request, response: Response) => {
  try {
    const termTypes = await PgDataSource.getRepository(DictionaryTermType).find({
      where: { isActive: true },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });
    const termTypeKeys = termTypes.map((termType) => termType.termType);
    const aliases = termTypeKeys.length
      ? await PgDataSource.getRepository(DictionaryTermTypeAlias)
          .createQueryBuilder("alias")
          .where("alias.termType IN (:...termTypeKeys)", { termTypeKeys })
          .andWhere("alias.isActive = :isActive", { isActive: true })
          .orderBy("alias.aliasName", "ASC")
          .getMany()
      : [];
    const aliasesByTermType = new Map<string, DictionaryTermTypeAlias[]>();
    for (const alias of aliases) {
      aliasesByTermType.set(alias.termType, [
        ...(aliasesByTermType.get(alias.termType) ?? []),
        alias,
      ]);
    }

    response.json({
      termTypes: termTypes.map((termType) => {
        const hiddenAliases = new Set(
          [termType.termType, termType.displayName, termType.quoteDisplayName]
            .map((item) => normalizeText(item))
            .filter(Boolean),
        );
        return {
          ...termType,
          aliases: (aliasesByTermType.get(termType.termType) ?? []).filter(
            (alias) => !hiddenAliases.has(normalizeText(alias.aliasName)),
          ),
        };
      }),
    });
  } catch (error) {
    sendError(response, error);
  }
};

const createDictionaryTermType = async (
  request: Request,
  response: Response,
) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTermType);
    const termType = requireString(request.body?.termType, "termType");
    const displayName = requireString(request.body?.displayName, "displayName");
    const existing = await repo.findOne({ where: { termType } });
    const row =
      existing ??
      repo.create({
        termType,
      });

    row.displayName = displayName;
    row.quoteDisplayName =
      optionalString(request.body?.quoteDisplayName) ?? row.quoteDisplayName ?? null;
    row.description =
      optionalString(request.body?.description) ?? row.description ?? null;
    row.category = optionalString(request.body?.category) ?? row.category ?? null;
    row.valueKind =
      normalizeDictionaryValueKind(request.body?.valueKind) ?? row.valueKind ?? "enum";
    row.sortOrder =
      optionalInt(request.body?.sortOrder, "sortOrder") ?? row.sortOrder ?? 100;
    row.applicableProductTypes =
      normalizeApplicableProductTypes(request.body?.applicableProductTypes) ??
      row.applicableProductTypes ??
      ["common"];
    row.isActive = optionalBoolean(request.body?.isActive, "isActive") ?? true;

    const termTypeRow = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ termType: termTypeRow });
  } catch (error) {
    sendError(response, error);
  }
};

const updateDictionaryTermType = async (
  request: Request,
  response: Response,
) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTermType);
    const id = requireString(request.params.id, "id");
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new Error(`dictionary term type not found: ${id}`);

    if (request.body?.termType !== undefined) {
      row.termType = requireString(request.body.termType, "termType");
    }
    if (request.body?.displayName !== undefined) {
      row.displayName = requireString(request.body.displayName, "displayName");
    }
    const quoteDisplayName = optionalString(request.body?.quoteDisplayName);
    if (quoteDisplayName !== undefined) row.quoteDisplayName = quoteDisplayName;
    const description = optionalString(request.body?.description);
    if (description !== undefined) row.description = description;
    const category = optionalString(request.body?.category);
    if (category !== undefined) row.category = category;
    const valueKind = normalizeDictionaryValueKind(request.body?.valueKind);
    if (valueKind !== undefined) row.valueKind = valueKind;
    const sortOrder = optionalInt(request.body?.sortOrder, "sortOrder");
    if (sortOrder !== undefined) row.sortOrder = sortOrder;
    const applicableProductTypes = normalizeApplicableProductTypes(
      request.body?.applicableProductTypes,
    );
    if (applicableProductTypes !== undefined) {
      row.applicableProductTypes = applicableProductTypes;
    }
    const isActive = optionalBoolean(request.body?.isActive, "isActive");
    if (isActive !== undefined) row.isActive = isActive;

    const termType = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ termType });
  } catch (error) {
    sendError(response, error);
  }
};

const deleteDictionaryTermType = async (
  request: Request,
  response: Response,
) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTermType);
    const id = requireString(request.params.id, "id");
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new Error(`dictionary term type not found: ${id}`);
    row.isActive = false;
    const termType = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ termType });
  } catch (error) {
    sendError(response, error);
  }
};

const getDictionaryValues = async (request: Request, response: Response) => {
  try {
    const termType =
      typeof request.query.termType === "string"
        ? request.query.termType
        : undefined;
    const values = await PgDataSource.getRepository(DictionaryTerm).find({
      where: termType
        ? { termType, isActive: true }
        : { isActive: true },
      order: { termType: "ASC", createdAt: "DESC" },
    });
    const termIds = values.map((value) => value.id);
    const aliases = termIds.length
      ? await PgDataSource.getRepository(DictionaryAlias)
          .createQueryBuilder("alias")
          .where("alias.termId IN (:...termIds)", { termIds })
          .andWhere("alias.isActive = :isActive", { isActive: true })
          .orderBy("alias.aliasValue", "ASC")
          .getMany()
      : [];
    const aliasesByTermId = new Map<string, DictionaryAlias[]>();
    for (const alias of aliases) {
      aliasesByTermId.set(alias.termId, [
        ...(aliasesByTermId.get(alias.termId) ?? []),
        alias,
      ]);
    }

    response.json({
      values: values.map((value) => {
        const hiddenAliases = new Set(
          [value.canonicalValue, value.displayName]
            .map((item) => normalizeText(item))
            .filter(Boolean),
        );
        return {
          ...value,
          aliases: (aliasesByTermId.get(value.id) ?? []).filter(
            (alias) => !hiddenAliases.has(normalizeText(alias.aliasValue)),
          ),
        };
      }),
    });
  } catch (error) {
    sendError(response, error);
  }
};

const createDictionaryValue = async (request: Request, response: Response) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTerm);
    const termType = requireString(request.body?.termType, "termType");
    const canonicalValue = requireString(
      request.body?.canonicalValue,
      "canonicalValue",
    );
    const existing = await repo.findOne({ where: { termType, canonicalValue } });
    const row =
      existing ??
      repo.create({
        termType,
        canonicalValue,
      });

    row.displayName =
      optionalString(request.body?.displayName) ?? row.displayName ?? canonicalValue;
    row.description =
      optionalString(request.body?.description) ?? row.description ?? null;
    row.isActive = optionalBoolean(request.body?.isActive, "isActive") ?? true;

    const value = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ value });
  } catch (error) {
    sendError(response, error);
  }
};

const updateDictionaryValue = async (request: Request, response: Response) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTerm);
    const id = requireString(request.params.id, "id");
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new Error(`dictionary value not found: ${id}`);

    if (request.body?.termType !== undefined) {
      row.termType = requireString(request.body.termType, "termType");
    }
    if (request.body?.canonicalValue !== undefined) {
      row.canonicalValue = requireString(
        request.body.canonicalValue,
        "canonicalValue",
      );
    }
    const displayName = optionalString(request.body?.displayName);
    if (displayName !== undefined) row.displayName = displayName;
    const description = optionalString(request.body?.description);
    if (description !== undefined) row.description = description;
    const isActive = optionalBoolean(request.body?.isActive, "isActive");
    if (isActive !== undefined) row.isActive = isActive;

    const value = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ value });
  } catch (error) {
    sendError(response, error);
  }
};

const deleteDictionaryValue = async (request: Request, response: Response) => {
  try {
    const repo = PgDataSource.getRepository(DictionaryTerm);
    const id = requireString(request.params.id, "id");
    const row = await repo.findOne({ where: { id } });
    if (!row) throw new Error(`dictionary value not found: ${id}`);
    row.isActive = false;
    const value = await repo.save(row);
    await dictionaryService.bumpDictionaryVersion();
    response.json({ value });
  } catch (error) {
    sendError(response, error);
  }
};

const getDictionaryUnitAliases = async (_request: Request, response: Response) => {
  try {
    response.json({ aliases: await dictionaryService.listUnitAliases() });
  } catch (error) {
    sendError(response, error);
  }
};

const createDictionaryUnitAlias = async (
  request: Request,
  response: Response,
) => {
  try {
    const alias = await dictionaryService.saveUnitAlias({
      canonicalUnit: requireString(request.body?.canonicalUnit, "canonicalUnit"),
      displayUnit: optionalString(request.body?.displayUnit),
      aliasValue: requireString(request.body?.aliasValue, "aliasValue"),
      note: optionalString(request.body?.note),
      source: "manual",
    });
    response.json({ alias });
  } catch (error) {
    sendError(response, error);
  }
};

const updateDictionaryUnitAlias = async (
  request: Request,
  response: Response,
) => {
  try {
    const alias = await dictionaryService.updateUnitAlias({
      id: requireString(request.params.id, "id"),
      canonicalUnit:
        request.body?.canonicalUnit === undefined
          ? undefined
          : requireString(request.body.canonicalUnit, "canonicalUnit"),
      displayUnit: optionalString(request.body?.displayUnit),
      aliasValue:
        request.body?.aliasValue === undefined
          ? undefined
          : requireString(request.body.aliasValue, "aliasValue"),
      note: optionalString(request.body?.note),
      isActive: optionalBoolean(request.body?.isActive, "isActive"),
    });
    response.json({ alias });
  } catch (error) {
    sendError(response, error);
  }
};

const getUnitCandidates = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.query.status === "string" && request.query.status.trim()
        ? request.query.status.trim()
        : "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("status must be pending, approved, or rejected");
    }
    response.json({
      candidates: await dictionaryService.listUnitCandidates({ status }),
    });
  } catch (error) {
    sendError(response, error);
  }
};

const approveUnitCandidate = async (request: Request, response: Response) => {
  try {
    const result = await dictionaryService.approveUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      canonicalUnit: requireString(request.body?.canonicalUnit, "canonicalUnit"),
      displayUnit: optionalString(request.body?.displayUnit),
      aliasValue: optionalString(request.body?.aliasValue) ?? undefined,
      reviewedBy: optionalString(request.body?.reviewedBy) ?? undefined,
    });
    await productConfigAgentRepository.markAllDocumentsDictionaryDirty();
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
};

const rejectUnitCandidate = async (request: Request, response: Response) => {
  try {
    const candidate = await dictionaryService.rejectUnitCandidate({
      candidateId: requireString(request.params.candidateId, "candidateId"),
      reviewedBy: optionalString(request.body?.reviewedBy) ?? undefined,
      reason: optionalString(request.body?.reason) ?? undefined,
    });
    response.json({ candidate });
  } catch (error) {
    sendError(response, error);
  }
};

const getDictionaryProductTypes = async (
  _request: Request,
  response: Response,
) => {
  try {
    response.json(await dictionaryService.getProductTypeOptions());
  } catch (error) {
    sendError(response, error);
  }
};

const bindModelMasterData = async (request: Request, response: Response) => {
  try {
    const termType = requireString(request.body?.termType, "termType");
    if (!isProductConfigAgentModelTermType(termType)) {
      throw new Error("termType must be metering_pump_model or filter_model");
    }

    const itemIndex = Number(request.body?.itemIndex);
    if (!Number.isFinite(itemIndex)) {
      throw new Error("itemIndex must be a number");
    }

    response.json(
      await masterDataService.bindModel({
        documentId: requireString(request.body?.documentId, "documentId"),
        extractionResultId: requireString(
          request.body?.extractionResultId,
          "extractionResultId",
        ),
        itemIndex,
        termType,
        rawValue: requireString(request.body?.rawValue, "rawValue"),
        source: requireString(
          request.body?.source,
          "source",
        ) as ProductConfigAgentMasterDataSource,
        masterDataId: requireString(request.body?.masterDataId, "masterDataId"),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const suggestTermType = async (request: Request, response: Response) => {
  try {
    response.json(
      await dictionarySuggestionService.suggestTermTypeFromCandidate({
        candidateId: request.params.candidateId,
        model:
          typeof request.body?.model === "string" ? request.body.model : undefined,
        force: request.body?.force === true,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const suggestValueSplit = async (request: Request, response: Response) => {
  try {
    response.json(
      await dictionarySuggestionService.suggestValueSplitFromCandidate({
        candidateId: request.params.candidateId,
        model:
          typeof request.body?.model === "string" ? request.body.model : undefined,
        force: request.body?.force === true,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const suggestCandidatesBatch = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.body?.status === "string" ? request.body.status : "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("status must be pending, approved, or rejected");
    }
    const documentId =
      request.body?.documentId === undefined || request.body?.documentId === ""
        ? undefined
        : Number(request.body.documentId);
    if (documentId !== undefined && !Number.isFinite(documentId)) {
      throw new Error("documentId must be a number");
    }
    const scopedCandidates =
      documentId === undefined
        ? undefined
        : await productConfigAgentService.getCandidates({ status, documentId });
    response.json(
      await dictionarySuggestionService.suggestBatchCandidateReviews({
        status,
        termTypeCandidateIds: scopedCandidates?.termTypeCandidates.map((item) =>
          String(item.id),
        ),
        valueCandidateIds: scopedCandidates?.valueCandidates.map((item) =>
          String(item.id),
        ),
        model:
          typeof request.body?.model === "string" ? request.body.model : undefined,
        force: request.body?.force === true,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getCandidateClusterReviewPrompt = async (
  _request: Request,
  response: Response,
) => {
  try {
    response.json(dictionarySuggestionService.getClusterBatchReviewPrompt());
  } catch (error) {
    sendError(response, error);
  }
};

const getUnitCandidateReviewPrompt = async (
  _request: Request,
  response: Response,
) => {
  try {
    response.json(dictionarySuggestionService.getUnitCandidateReviewPrompt());
  } catch (error) {
    sendError(response, error);
  }
};

const getCandidateClusters = async (request: Request, response: Response) => {
  try {
    const status =
      typeof request.query.status === "string" ? request.query.status : "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("status must be pending, approved, or rejected");
    }
    const candidateType =
      typeof request.query.candidateType === "string" &&
      request.query.candidateType
        ? request.query.candidateType
        : "all";
    if (!["all", "term_type", "value"].includes(candidateType)) {
      throw new Error("candidateType must be all, term_type, or value");
    }
    const documentId =
      typeof request.query.documentId === "string" && request.query.documentId
        ? Number(request.query.documentId)
        : undefined;
    if (documentId !== undefined && !Number.isFinite(documentId)) {
      throw new Error("documentId must be a number");
    }
    const limit =
      typeof request.query.limit === "string" && request.query.limit
        ? Number(request.query.limit)
        : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error("limit must be a positive number");
    }
    const input = await dictionarySuggestionService.buildClusterBatchReviewInput({
        status,
        candidateType: candidateType as "all" | "term_type" | "value",
        documentId,
        limit,
      });
    response.json({
      candidateClusters: input.candidateClusters,
      summary: {
        status,
        candidateType,
        documentId: documentId ?? null,
        limit: limit ?? null,
        clusterCount: input.clusterSummary.totalClusterCount,
        termTypeClusterCount: input.clusterSummary.totalTermTypeClusterCount,
        valueClusterCount: input.clusterSummary.totalValueClusterCount,
        returnedClusterCount: input.clusterSummary.returnedClusterCount,
      },
      options: {
        productTypes: input.productTypes,
        termTypes: input.termTypes,
        enumValues: input.enumValues,
        runPolicy: input.runPolicy,
      },
      productTypes: input.productTypes,
      termTypes: input.termTypes,
      enumValues: input.enumValues,
      priorDecisions: input.priorDecisions,
      runPolicy: input.runPolicy,
    });
  } catch (error) {
    sendError(response, error);
  }
};

const suggestCandidateClustersBatch = async (
  request: Request,
  response: Response,
) => {
  try {
    const clusterIds = requireStringArray(request.body?.clusterIds, "clusterIds");
    const status =
      typeof request.body?.status === "string" ? request.body.status : "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error("status must be pending, approved, or rejected");
    }
    response.json(
      await dictionarySuggestionService.suggestBatchCandidateClusterReviews({
        status,
        clusterIds,
        model:
          typeof request.body?.model === "string" ? request.body.model : undefined,
        priorDecisions: request.body?.priorDecisions,
        runPolicy:
          request.body?.runPolicy && typeof request.body.runPolicy === "object"
            ? request.body.runPolicy
            : undefined,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const createTermType = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "term_type",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        action: "create_term_type",
        payload: {
          termType: requireString(request.body.termType, "termType"),
          displayName: requireString(request.body.displayName, "displayName"),
          quoteDisplayName: request.body.quoteDisplayName,
          description: request.body.description,
          category: request.body.category,
          sortOrder:
            request.body.sortOrder === undefined || request.body.sortOrder === ""
              ? undefined
              : Number(request.body.sortOrder),
          valueKind: requireString(request.body.valueKind, "valueKind"),
          aliasNames: optionalStringArray(request.body.aliasNames),
          valueCanonicalValue: request.body.valueCanonicalValue,
          valueDisplayName: request.body.valueDisplayName,
          valueAliasNames: optionalStringArray(request.body.valueAliasNames),
          applicableProductTypes: normalizeApplicableProductTypes(
            request.body.applicableProductTypes,
          ),
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const approveTermTypeAsAlias = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "term_type",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        action: "approve_term_type_as_alias",
        payload: {
          termType: requireString(request.body.termType, "termType"),
          valueKind: request.body.valueKind,
          aliasNames: optionalStringArray(request.body.aliasNames),
          valueCanonicalValue: request.body.valueCanonicalValue,
          valueDisplayName: request.body.valueDisplayName,
          valueAliasNames: optionalStringArray(request.body.valueAliasNames),
          appendApplicableProductType:
            request.body.appendApplicableProductType === true,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const splitTermType = async (request: Request, response: Response) => {
  try {
    const splits = normalizeTermTypeSplitRows(request.body.splits);
    if (splits.length === 0) {
      throw new Error("splits is required");
    }

    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "term_type",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        action: "split_term_type",
        payload: {
          splits,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const markTermTypeAsDocInfo = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "term_type",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        action: "mark_term_type_as_doc_info",
        payload: {
          reviewedBy: request.body.reviewedBy,
          reason: request.body.reason,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const createValue = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "value",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "create_value",
        payload: {
          canonicalValue: requireString(
            request.body.canonicalValue,
            "canonicalValue",
          ),
          displayName: request.body.displayName,
          aliasNames: optionalStringArray(request.body.aliasNames),
          values: normalizeValueRows(request.body.values),
          suppressCandidateRawAlias:
            request.body.suppressCandidateRawAlias === true,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const approveValueAsAlias = async (request: Request, response: Response) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "value",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "approve_value_as_alias",
        payload: {
          termId: requireString(request.body.termId, "termId"),
          aliasNames: optionalStringArray(request.body.aliasNames),
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const updateValueCandidateTermTypeKind = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "value",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "update_term_type_value_kind",
        payload: {
          termType: requireString(request.body.termType, "termType"),
          valueKind: requireString(request.body.valueKind, "valueKind"),
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const splitValue = async (request: Request, response: Response) => {
  try {
    const splits = normalizeValueSplitRows(request.body.splits);
    if (splits.length === 0) {
      throw new Error("splits is required");
    }

    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "value",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "split_value",
        payload: {
          splits,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const moveValueToOtherTermType = async (
  request: Request,
  response: Response,
) => {
  try {
    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: "value",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "move_value_to_other_term_type",
        payload: {
          termType: requireString(request.body.termType, "termType"),
          rawValue: requireString(request.body.rawValue, "rawValue"),
          reason: request.body.reason,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const rejectCandidate = async (request: Request, response: Response) => {
  try {
    const type = request.params.type;
    if (type !== "value" && type !== "term-type") {
      throw new Error("type must be value or term-type");
    }

    response.json(
      await productConfigAgentService.reviewCandidateAndRefresh({
        candidateType: type === "value" ? "value" : "term_type",
        candidateId: request.params.candidateId,
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        action: "reject",
        payload: {
          reason: request.body.reason,
          reviewedBy: request.body.reviewedBy,
        },
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const reviewCandidatesBatch = async (request: Request, response: Response) => {
  try {
    const operations = normalizeBatchReviewOperations(request.body?.operations);
    if (shouldRunCandidateReviewBatchAsync(request)) {
      response.status(202).json({
        async: true,
        job: await productConfigAgentService.startCandidateReviewBatchJob({
          refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
          deferCandidateRecheck: shouldDeferCandidateRecheck(request),
          operations,
        }),
      });
      return;
    }

    response.json(
      await productConfigAgentService.reviewCandidatesBatch({
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        operations,
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

const getProductConfigAgentBackgroundJob = async (request: Request, response: Response) => {
  try {
    const job = await productConfigAgentService.getBackgroundJob(
      requireString(request.params.jobId, "jobId"),
    );
    if (!job) {
      response.status(404).json({ error: "background job not found" });
      return;
    }
    response.json(job);
  } catch (error) {
    sendError(response, error);
  }
};

export const ProductConfigAgentRoutes = [
  {
    path: "/productConfigAgent/agent/sessions",
    method: "post",
    action: withProductConfigAgentToken(createAgentSession),
  },
  {
    path: "/productConfigAgent/agent/run",
    method: "post",
    action: withProductConfigAgentToken(runProductConfigAgentNaturalLanguage),
  },
  {
    path: "/productConfigAgent/agent/sessions/:sessionId",
    method: "get",
    action: withProductConfigAgentToken(getAgentSession),
  },
  {
    path: "/productConfigAgent/agent/configs/:id/share-token",
    method: "post",
    action: withProductConfigAgentToken(createAgentGeneratedConfigShareToken),
  },
  {
    path: "/productConfigAgent/agent/configs/:id/share-token/revoke",
    method: "post",
    action: withProductConfigAgentToken(revokeAgentGeneratedConfigShareToken),
  },
  {
    path: "/productConfigAgent/agent/configs/:id",
    method: "get",
    action: withProductConfigAgentToken(getAgentGeneratedConfig),
  },
  {
    path: "/productConfigAgent/agent/shared/:shareToken",
    method: "get",
    action: getSharedAgentGeneratedConfig,
  },
  {
    path: "/productConfigAgent/contracts/upload",
    method: "post",
    action: withProductConfigAgentAdmin(uploadContract),
  },
  ...createProductConfigAgentArchiveRoutes(withProductConfigAgentAdmin, withProductConfigAgentToken),
  {
    path: "/productConfigAgent/documents/pending-llm-upload/start",
    method: "post",
    action: withProductConfigAgentAdmin(startPendingLlmUpload),
  },
  {
    path: "/productConfigAgent/documents/pending-llm-upload/status",
    method: "get",
    action: withProductConfigAgentToken(getPendingLlmUploadStatus),
  },
  {
    path: "/productConfigAgent/dictionary-dirty/refresh/start",
    method: "post",
    action: withProductConfigAgentAdmin(startDirtyDataRefresh),
  },
  {
    path: "/productConfigAgent/dictionary-dirty/refresh/status",
    method: "get",
    action: withProductConfigAgentToken(getDirtyDataRefreshStatus),
  },
  {
    path: "/productConfigAgent/contracts/:documentId/candidates/generate",
    method: "post",
    action: withProductConfigAgentAdmin(generateCandidates),
  },
  {
    path: "/productConfigAgent/contracts/:documentId",
    method: "get",
    action: withProductConfigAgentToken(getContract),
  },
  {
    path: "/productConfigAgent/extractions",
    method: "get",
    action: withProductConfigAgentToken(listExtractions),
  },
  {
    path: "/api/extractions",
    method: "get",
    action: withProductConfigAgentToken(listExtractions),
  },
  {
    path: "/productConfigAgent/extractions/renormalize-batch",
    method: "post",
    action: withProductConfigAgentAdmin(renormalizeExtractionsBatch),
  },
  {
    path: "/productConfigAgent/extraction-results/:extractionResultId/renormalize",
    method: "post",
    action: withProductConfigAgentAdmin(renormalizeExtractionResult),
  },
  {
    path: "/productConfigAgent/extractions/:documentId",
    method: "get",
    action: withProductConfigAgentToken(getExtractionDetail),
  },
  {
    path: "/productConfigAgent/extractions/:documentId/reextract",
    method: "post",
    action: withProductConfigAgentAdmin(reextractDocumentWithLlm),
  },
  {
    path: "/productConfigAgent/extractions/:documentId/renormalize",
    method: "post",
    action: withProductConfigAgentAdmin(renormalizeExtraction),
  },
  {
    path: "/api/extractions/:documentId",
    method: "get",
    action: withProductConfigAgentToken(getExtractionDetail),
  },
  {
    path: "/api/extractions/:documentId/reextract",
    method: "post",
    action: withProductConfigAgentAdmin(reextractDocumentWithLlm),
  },
  {
    path: "/api/extractions/:documentId/renormalize",
    method: "post",
    action: withProductConfigAgentAdmin(renormalizeExtraction),
  },
  {
    path: "/api/extraction-results/:extractionResultId/renormalize",
    method: "post",
    action: withProductConfigAgentAdmin(renormalizeExtractionResult),
  },
  {
    path: "/productConfigAgent/documents/:documentId/open-file",
    method: "post",
    action: withProductConfigAgentAdmin(openDocumentFile),
  },
  {
    path: "/productConfigAgent/candidates",
    method: "get",
    action: withProductConfigAgentToken(getCandidates),
  },
  {
    path: "/productConfigAgent/candidates/suggestions/batch",
    method: "post",
    action: withProductConfigAgentAdmin(suggestCandidatesBatch),
  },
  {
    path: "/productConfigAgent/candidates/clusters/review-prompt",
    method: "get",
    action: withProductConfigAgentToken(getCandidateClusterReviewPrompt),
  },
  {
    path: "/productConfigAgent/candidates/clusters",
    method: "get",
    action: withProductConfigAgentToken(getCandidateClusters),
  },
  {
    path: "/productConfigAgent/candidates/clusters/suggestions/batch",
    method: "post",
    action: withProductConfigAgentAdmin(suggestCandidateClustersBatch),
  },
  {
    path: "/productConfigAgent/candidates/reviews/batch",
    method: "post",
    action: withProductConfigAgentAdmin(reviewCandidatesBatch),
  },
  {
    path: "/productConfigAgent/jobs/:jobId",
    method: "get",
    action: withProductConfigAgentToken(getProductConfigAgentBackgroundJob),
  },
  {
    path: "/productConfigAgent/dictionary/term-types",
    method: "get",
    action: withProductConfigAgentToken(getDictionaryTermTypes),
  },
  {
    path: "/productConfigAgent/dictionary/term-types",
    method: "post",
    action: withProductConfigAgentAdmin(createDictionaryTermType),
  },
  {
    path: "/productConfigAgent/dictionary/term-types/:id",
    method: "patch",
    action: withProductConfigAgentAdmin(updateDictionaryTermType),
  },
  {
    path: "/productConfigAgent/dictionary/term-types/:id",
    method: "delete",
    action: withProductConfigAgentAdmin(deleteDictionaryTermType),
  },
  {
    path: "/productConfigAgent/dictionary/values",
    method: "get",
    action: withProductConfigAgentToken(getDictionaryValues),
  },
  {
    path: "/productConfigAgent/dictionary/values",
    method: "post",
    action: withProductConfigAgentAdmin(createDictionaryValue),
  },
  {
    path: "/productConfigAgent/dictionary/values/:id",
    method: "patch",
    action: withProductConfigAgentAdmin(updateDictionaryValue),
  },
  {
    path: "/productConfigAgent/dictionary/values/:id",
    method: "delete",
    action: withProductConfigAgentAdmin(deleteDictionaryValue),
  },
  {
    path: "/productConfigAgent/dictionary/unit-aliases",
    method: "get",
    action: withProductConfigAgentToken(getDictionaryUnitAliases),
  },
  {
    path: "/productConfigAgent/dictionary/unit-aliases",
    method: "post",
    action: withProductConfigAgentAdmin(createDictionaryUnitAlias),
  },
  {
    path: "/productConfigAgent/dictionary/unit-aliases/:id",
    method: "patch",
    action: withProductConfigAgentAdmin(updateDictionaryUnitAlias),
  },
  {
    path: "/productConfigAgent/dictionary/product-types",
    method: "get",
    action: withProductConfigAgentToken(getDictionaryProductTypes),
  },
  {
    path: "/productConfigAgent/candidates/units",
    method: "get",
    action: withProductConfigAgentToken(getUnitCandidates),
  },
  {
    path: "/productConfigAgent/candidates/units/review-prompt",
    method: "get",
    action: withProductConfigAgentToken(getUnitCandidateReviewPrompt),
  },
  {
    path: "/productConfigAgent/candidates/units/:candidateId/approve",
    method: "post",
    action: withProductConfigAgentAdmin(approveUnitCandidate),
  },
  {
    path: "/productConfigAgent/candidates/units/:candidateId/reject",
    method: "post",
    action: withProductConfigAgentAdmin(rejectUnitCandidate),
  },
  {
    path: "/productConfigAgent/master-data/model-binding",
    method: "post",
    action: withProductConfigAgentAdmin(bindModelMasterData),
  },
  {
    path: "/api/dictionary/product-types",
    method: "get",
    action: withProductConfigAgentToken(getDictionaryProductTypes),
  },
  {
    path: "/productConfigAgent/candidates/term-type/:candidateId/create-term-type",
    method: "post",
    action: withProductConfigAgentAdmin(createTermType),
  },
  {
    path: "/productConfigAgent/candidates/term-type/:candidateId/suggest",
    method: "post",
    action: withProductConfigAgentAdmin(suggestTermType),
  },
  {
    path: "/productConfigAgent/candidates/term-type/:candidateId/approve-as-alias",
    method: "post",
    action: withProductConfigAgentAdmin(approveTermTypeAsAlias),
  },
  {
    path: "/productConfigAgent/candidates/term-type/:candidateId/split",
    method: "post",
    action: withProductConfigAgentAdmin(splitTermType),
  },
  {
    path: "/productConfigAgent/candidates/term-type/:candidateId/mark-as-doc-info",
    method: "post",
    action: withProductConfigAgentAdmin(markTermTypeAsDocInfo),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/create-value",
    method: "post",
    action: withProductConfigAgentAdmin(createValue),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/split-suggest",
    method: "post",
    action: withProductConfigAgentAdmin(suggestValueSplit),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/split",
    method: "post",
    action: withProductConfigAgentAdmin(splitValue),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/move-to-term-type",
    method: "post",
    action: withProductConfigAgentAdmin(moveValueToOtherTermType),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/approve-as-alias",
    method: "post",
    action: withProductConfigAgentAdmin(approveValueAsAlias),
  },
  {
    path: "/productConfigAgent/candidates/value/:candidateId/update-term-type-kind",
    method: "post",
    action: withProductConfigAgentAdmin(updateValueCandidateTermTypeKind),
  },
  {
    path: "/productConfigAgent/candidates/:type/:candidateId/reject",
    method: "post",
    action: withProductConfigAgentAdmin(rejectCandidate),
  },
];

function legacyProductConfigAgentRoutePath(path: string): string {
  return path.startsWith("/productConfigAgent/")
    ? path.replace("/productConfigAgent/", "/quoteAgent/")
    : path;
}

export const LegacyProductConfigAgentRoutes = ProductConfigAgentRoutes.filter(
  (route) =>
    route.path.startsWith("/productConfigAgent/") &&
    !route.path.startsWith("/productConfigAgent/agent/"),
).map((route) => ({
  ...route,
  path: legacyProductConfigAgentRoutePath(route.path),
}));
