import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Request, Response } from "express";
import { PgDataSource } from "../../../config/data-source.js";
import {
  DictionaryTerm,
  DictionaryTermType,
} from "../dictionary/entity/index.js";
import { DictionaryService } from "../dictionary/dictionary.service.js";
import { DictionarySuggestionService } from "../dictionary/dictionarySuggestion.service.js";
import {
  isQuoteAgentModelTermType,
  QuoteAgentMasterDataService,
  type QuoteAgentMasterDataSource,
} from "../masterData.service.js";
import { quoteAgentService } from "../service.js";

const uploadDir = path.join(process.cwd(), "uploads", "quote-agent");
const dictionarySuggestionService = new DictionarySuggestionService(PgDataSource);
const dictionaryService = new DictionaryService(PgDataSource);
const masterDataService = new QuoteAgentMasterDataService(PgDataSource);
const execFileAsync = promisify(execFile);

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  response.status(400).json({ error: message });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeApplicableProductTypes(value: unknown): string[] | undefined {
  const values = optionalStringArray(value);
  if (!values) return undefined;
  return [...new Set(values)];
}

function normalizeSplitRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any) => ({
      termType: String(item?.termType ?? "").trim(),
      rawValue: String(item?.rawValue ?? "").trim() || undefined,
    }))
    .filter((item) => item.termType && item.rawValue);
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

function normalizeBatchReviewOperations(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("operations is required");
  }
  const allowedActions = new Set([
    "create_term_type",
    "approve_term_type_as_alias",
    "create_value",
    "approve_value_as_alias",
    "split_value",
    "move_value_to_other_term_type",
    "update_term_type_value_kind",
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
    return {
      candidateType: candidateType as "term_type" | "value",
      candidateId: requireString(item?.candidateId, "candidateId"),
      action: action as any,
      payload: item?.payload ?? {},
    };
  });
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
    const result = await quoteAgentService.process({
      filePath: uploaded.filePath,
      fileName: uploaded.fileName,
      source: "quote_agent_upload",
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

    const job = quoteAgentService.startPendingLlmUploadJob({
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
    response.json({ job: quoteAgentService.getPendingLlmUploadJob() });
  } catch (error) {
    sendError(response, error);
  }
};

const generateCandidates = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await quoteAgentService.generateDictionaryForDocument(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const getContract = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await quoteAgentService.getContract(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const listExtractions = async (request: Request, response: Response) => {
  try {
    response.json(
      await quoteAgentService.listExtractions({
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
    response.json(await quoteAgentService.getExtractionDetail(documentId));
  } catch (error) {
    sendError(response, error);
  }
};

const renormalizeExtraction = async (request: Request, response: Response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!documentId) throw new Error("documentId is required");
    response.json(await quoteAgentService.generateDictionaryForDocument(documentId));
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
    const result = await quoteAgentService.reextractDocumentWithLlm({
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
    const contract = await quoteAgentService.getContract(documentId);
    const filePath = contract.document?.filePath;
    if (!filePath) {
      throw new Error(`Document file path not found: ${documentId}`);
    }
    await fs.access(filePath);

    if (process.platform === "darwin") {
      await execFileAsync("open", [filePath]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", filePath]);
    } else {
      await execFileAsync("xdg-open", [filePath]);
    }

    response.json({
      ok: true,
      documentId,
      fileName: contract.document.fileName,
      filePath,
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
    const candidates = await quoteAgentService.getCandidates({
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
    response.json({ termTypes });
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
    response.json({ values });
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
    if (!isQuoteAgentModelTermType(termType)) {
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
        ) as QuoteAgentMasterDataSource,
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
        : await quoteAgentService.getCandidates({ status, documentId });
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

const createTermType = async (request: Request, response: Response) => {
  try {
    response.json(
      await quoteAgentService.reviewCandidateAndRefresh({
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
      await quoteAgentService.reviewCandidateAndRefresh({
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

const createValue = async (request: Request, response: Response) => {
  try {
    response.json(
      await quoteAgentService.reviewCandidateAndRefresh({
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
      await quoteAgentService.reviewCandidateAndRefresh({
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
      await quoteAgentService.reviewCandidateAndRefresh({
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
    const splits = normalizeSplitRows(request.body.splits);
    if (splits.length === 0) {
      throw new Error("splits is required");
    }

    response.json(
      await quoteAgentService.reviewCandidateAndRefresh({
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
      await quoteAgentService.reviewCandidateAndRefresh({
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
      await quoteAgentService.reviewCandidateAndRefresh({
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
    response.json(
      await quoteAgentService.reviewCandidatesBatch({
        refreshAffectedDocuments: shouldRefreshAffectedDocuments(request),
        deferCandidateRecheck: shouldDeferCandidateRecheck(request),
        operations: normalizeBatchReviewOperations(request.body?.operations),
      }),
    );
  } catch (error) {
    sendError(response, error);
  }
};

export const QuoteAgentRoutes = [
  {
    path: "/quoteAgent/contracts/upload",
    method: "post",
    action: uploadContract,
  },
  {
    path: "/quoteAgent/documents/pending-llm-upload/start",
    method: "post",
    action: startPendingLlmUpload,
  },
  {
    path: "/quoteAgent/documents/pending-llm-upload/status",
    method: "get",
    action: getPendingLlmUploadStatus,
  },
  {
    path: "/quoteAgent/contracts/:documentId/candidates/generate",
    method: "post",
    action: generateCandidates,
  },
  {
    path: "/quoteAgent/contracts/:documentId",
    method: "get",
    action: getContract,
  },
  {
    path: "/quoteAgent/extractions",
    method: "get",
    action: listExtractions,
  },
  {
    path: "/api/extractions",
    method: "get",
    action: listExtractions,
  },
  {
    path: "/quoteAgent/extractions/:documentId",
    method: "get",
    action: getExtractionDetail,
  },
  {
    path: "/quoteAgent/extractions/:documentId/reextract",
    method: "post",
    action: reextractDocumentWithLlm,
  },
  {
    path: "/quoteAgent/extractions/:documentId/renormalize",
    method: "post",
    action: renormalizeExtraction,
  },
  {
    path: "/api/extractions/:documentId",
    method: "get",
    action: getExtractionDetail,
  },
  {
    path: "/api/extractions/:documentId/reextract",
    method: "post",
    action: reextractDocumentWithLlm,
  },
  {
    path: "/api/extractions/:documentId/renormalize",
    method: "post",
    action: renormalizeExtraction,
  },
  {
    path: "/quoteAgent/documents/:documentId/open-file",
    method: "post",
    action: openDocumentFile,
  },
  {
    path: "/quoteAgent/candidates",
    method: "get",
    action: getCandidates,
  },
  {
    path: "/quoteAgent/candidates/suggestions/batch",
    method: "post",
    action: suggestCandidatesBatch,
  },
  {
    path: "/quoteAgent/candidates/reviews/batch",
    method: "post",
    action: reviewCandidatesBatch,
  },
  {
    path: "/quoteAgent/dictionary/term-types",
    method: "get",
    action: getDictionaryTermTypes,
  },
  {
    path: "/quoteAgent/dictionary/values",
    method: "get",
    action: getDictionaryValues,
  },
  {
    path: "/quoteAgent/dictionary/product-types",
    method: "get",
    action: getDictionaryProductTypes,
  },
  {
    path: "/quoteAgent/master-data/model-binding",
    method: "post",
    action: bindModelMasterData,
  },
  {
    path: "/api/dictionary/product-types",
    method: "get",
    action: getDictionaryProductTypes,
  },
  {
    path: "/quoteAgent/candidates/term-type/:candidateId/create-term-type",
    method: "post",
    action: createTermType,
  },
  {
    path: "/quoteAgent/candidates/term-type/:candidateId/suggest",
    method: "post",
    action: suggestTermType,
  },
  {
    path: "/quoteAgent/candidates/term-type/:candidateId/approve-as-alias",
    method: "post",
    action: approveTermTypeAsAlias,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/create-value",
    method: "post",
    action: createValue,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/split-suggest",
    method: "post",
    action: suggestValueSplit,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/split",
    method: "post",
    action: splitValue,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/move-to-term-type",
    method: "post",
    action: moveValueToOtherTermType,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/approve-as-alias",
    method: "post",
    action: approveValueAsAlias,
  },
  {
    path: "/quoteAgent/candidates/value/:candidateId/update-term-type-kind",
    method: "post",
    action: updateValueCandidateTermTypeKind,
  },
  {
    path: "/quoteAgent/candidates/:type/:candidateId/reject",
    method: "post",
    action: rejectCandidate,
  },
];
