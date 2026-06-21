import { DataSource } from "typeorm";
import {
  DictionaryCandidate,
  DictionaryTermTypeCandidate,
} from "./entity/index.js";
import type {
  CreateTermTypeCandidateParams,
  CreateValueCandidateParams,
} from "./dictionary.types.js";

export async function createValueCandidate(
  dataSource: DataSource,
  params: CreateValueCandidateParams,
  normalizedRawValue: string,
): Promise<DictionaryCandidate | null> {
  if (!normalizedRawValue) {
    throw new Error("rawValue cannot be empty after normalization");
  }

  // Merge sourceRawValue / splitFromRawValue into evidence for enums context
  const enrichedEvidence = (() => {
    if (!params.sourceRawValue && !params.splitFromRawValue) return params.evidence ?? null;
    return {
      ...(params.evidence && typeof params.evidence === 'object' ? params.evidence : {}),
      ...(params.sourceRawValue !== undefined ? { sourceRawValue: params.sourceRawValue } : {}),
      ...(params.splitFromRawValue !== undefined ? { splitFromRawValue: params.splitFromRawValue } : {}),
    };
  })();

  const sourceProductType = normalizeSourceProductType(params.sourceProductType);
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const matchingCandidates = await candidateRepo.find({
    where: [
      {
        termType: params.termType,
        normalizedRawValue,
        status: "rejected",
      },
      {
        termType: params.termType,
        normalizedRawValue,
        status: "pending",
      },
    ],
    take: 2,
  });
  if (matchingCandidates.some((candidate) => candidate.status === "rejected")) {
    return null;
  }

  const existingCandidate = matchingCandidates.find(
    (candidate) => candidate.status === "pending",
  );

  if (existingCandidate) {
    let shouldSave = false;
    if (params.confidence !== undefined) {
      const existingConfidence =
        existingCandidate.confidence === null
          ? null
          : Number(existingCandidate.confidence);
      if (existingConfidence === null || params.confidence > existingConfidence) {
        existingCandidate.confidence = String(params.confidence);
        shouldSave = true;
      }
    }
    if (
      existingCandidate.sourceProductType === "unknown" &&
      sourceProductType !== "unknown"
    ) {
      existingCandidate.sourceProductType = sourceProductType;
      shouldSave = true;
    }
    if (!existingCandidate.reason && params.reason) {
      existingCandidate.reason = params.reason;
      shouldSave = true;
    }
    // Merge enums context into evidence if available
    if (
      !existingCandidate.evidence &&
      (params.sourceRawValue !== undefined || params.splitFromRawValue !== undefined)
    ) {
      existingCandidate.evidence = {
        ...(existingCandidate.evidence && typeof existingCandidate.evidence === 'object' ? existingCandidate.evidence : {}),
        ...(params.sourceRawValue !== undefined ? { sourceRawValue: params.sourceRawValue } : {}),
        ...(params.splitFromRawValue !== undefined ? { splitFromRawValue: params.splitFromRawValue } : {}),
      };
      shouldSave = true;
    } else if (!existingCandidate.evidence && params.evidence !== undefined) {
      existingCandidate.evidence = params.evidence;
      shouldSave = true;
    }
    return shouldSave ? candidateRepo.save(existingCandidate) : existingCandidate;
  }

  const newCandidate = candidateRepo.create({
    documentId: params.documentId ?? null,
    extractionResultId: params.extractionResultId ?? null,
    itemIndex: params.itemIndex ?? null,
    sourceProductType,
    termType: params.termType,
    rawValue: params.rawValue,
    normalizedRawValue,
    proposedCanonicalValue: null,
    proposedTermId: null,
    reason: params.reason ?? "value_no_match",
    evidence: enrichedEvidence,
    confidence: params.confidence === undefined ? null : String(params.confidence),
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
  });
  const inserted = await candidateRepo
    .createQueryBuilder()
    .insert()
    .into(DictionaryCandidate)
    .values(newCandidate as any)
    .orIgnore()
    .returning(["id", "sourceProductType", "status", "createdAt", "updatedAt"])
    .execute();
  const insertedRaw = inserted.raw?.[0] as Record<string, unknown> | undefined;
  if (insertedRaw?.id) {
    return candidateRepo.create({
      ...newCandidate,
      id: String(insertedRaw.id),
      sourceProductType:
        stringFromRaw(insertedRaw.source_product_type) ??
        stringFromRaw(insertedRaw.sourceProductType) ??
        newCandidate.sourceProductType,
      status:
        stringFromRaw(insertedRaw.status) ?? newCandidate.status,
      createdAt:
        dateFromRaw(insertedRaw.created_at) ??
        dateFromRaw(insertedRaw.createdAt) ??
        newCandidate.createdAt,
      updatedAt:
        dateFromRaw(insertedRaw.updated_at) ??
        dateFromRaw(insertedRaw.updatedAt) ??
        newCandidate.updatedAt,
    });
  }

  const racedCandidate = await findValueCandidateAfterUniqueConflict(
    dataSource,
    params.termType,
    normalizedRawValue,
  );
  if (racedCandidate?.status === "rejected") {
    return null;
  }
  if (racedCandidate?.status === "pending") {
    return racedCandidate;
  }
  return null;
}

export async function createTermTypeCandidate(
  dataSource: DataSource,
  params: CreateTermTypeCandidateParams,
  normalizedFieldName: string,
): Promise<DictionaryTermTypeCandidate | null> {
  if (!normalizedFieldName) {
    throw new Error("rawFieldName cannot be empty after normalization");
  }

  const sourceProductType = normalizeSourceProductType(params.sourceProductType);
  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const matchingCandidates = await candidateRepo.find({
    where:
      params.ignoreRejected === true
        ? [
            {
              sourceProductType,
              normalizedFieldName,
              status: "pending",
            },
          ]
        : [
            {
              normalizedFieldName,
              status: "rejected",
            },
            {
              sourceProductType,
              normalizedFieldName,
              status: "pending",
            },
          ],
    take: 2,
  });
  if (params.ignoreRejected !== true) {
    if (matchingCandidates.some((candidate) => candidate.status === "rejected")) {
      return null;
    }
  }

  const existingCandidate = matchingCandidates.find(
    (candidate) =>
      candidate.status === "pending" &&
      candidate.sourceProductType === sourceProductType,
  );

  if (existingCandidate) {
    let shouldSave = false;
    if (!existingCandidate.rawValue && params.rawValue !== undefined) {
      existingCandidate.rawValue = params.rawValue;
      shouldSave = true;
    }
    if (!existingCandidate.proposedTermType && params.proposedTermType !== undefined) {
      existingCandidate.proposedTermType = params.proposedTermType;
      shouldSave = true;
    }
    if (!existingCandidate.reason && params.reason) {
      existingCandidate.reason = params.reason;
      shouldSave = true;
    }
    if (!existingCandidate.evidence && params.evidence !== undefined) {
      existingCandidate.evidence = params.evidence;
      shouldSave = true;
    }
    if (params.confidence !== undefined) {
      const existingConfidence =
        existingCandidate.confidence === null
          ? null
          : Number(existingCandidate.confidence);
      if (existingConfidence === null || params.confidence > existingConfidence) {
        existingCandidate.confidence = String(params.confidence);
        shouldSave = true;
      }
    }
    return shouldSave ? candidateRepo.save(existingCandidate) : existingCandidate;
  }

  const newCandidate = candidateRepo.create({
    sourceProductType,
    documentId: params.documentId ?? null,
    extractionResultId: params.extractionResultId ?? null,
    itemIndex: params.itemIndex ?? null,
    rawFieldName: params.rawFieldName,
    normalizedFieldName,
    rawValue: params.rawValue ?? null,
    proposedTermType: params.proposedTermType ?? null,
    reason: params.reason ?? "term_type_no_match",
    evidence: params.evidence ?? null,
    confidence: params.confidence === undefined ? null : String(params.confidence),
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
  });
  const inserted = await candidateRepo
    .createQueryBuilder()
    .insert()
    .into(DictionaryTermTypeCandidate)
    .values(newCandidate as any)
    .orIgnore()
    .returning(["id", "sourceProductType", "status", "createdAt", "updatedAt"])
    .execute();
  const insertedRaw = inserted.raw?.[0] as Record<string, unknown> | undefined;
  if (insertedRaw?.id) {
    return candidateRepo.create({
      ...newCandidate,
      id: String(insertedRaw.id),
      sourceProductType:
        stringFromRaw(insertedRaw.source_product_type) ??
        stringFromRaw(insertedRaw.sourceProductType) ??
        newCandidate.sourceProductType,
      status:
        stringFromRaw(insertedRaw.status) ?? newCandidate.status,
      createdAt:
        dateFromRaw(insertedRaw.created_at) ??
        dateFromRaw(insertedRaw.createdAt) ??
        newCandidate.createdAt,
      updatedAt:
        dateFromRaw(insertedRaw.updated_at) ??
        dateFromRaw(insertedRaw.updatedAt) ??
        newCandidate.updatedAt,
    });
  }

  const racedCandidate = await findTermTypeCandidateAfterUniqueConflict(
    dataSource,
    sourceProductType,
    normalizedFieldName,
    params.ignoreRejected === true,
  );
  if (racedCandidate?.status === "rejected") {
    return null;
  }
  if (racedCandidate?.status === "pending") {
    return racedCandidate;
  }
  return null;
}

function normalizeSourceProductType(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
}

async function findValueCandidateAfterUniqueConflict(
  dataSource: DataSource,
  termType: string,
  normalizedRawValue: string,
): Promise<DictionaryCandidate | null> {
  const repo = dataSource.getRepository(DictionaryCandidate);
  const candidates = await repo.find({
    where: [
      { termType, normalizedRawValue, status: "rejected" },
      { termType, normalizedRawValue, status: "pending" },
    ],
    take: 2,
  });
  return (
    candidates.find((candidate) => candidate.status === "rejected") ??
    candidates.find((candidate) => candidate.status === "pending") ??
    null
  );
}

async function findTermTypeCandidateAfterUniqueConflict(
  dataSource: DataSource,
  sourceProductType: string,
  normalizedFieldName: string,
  ignoreRejected: boolean,
): Promise<DictionaryTermTypeCandidate | null> {
  const repo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const candidates = await repo.find({
    where: ignoreRejected
      ? [{ sourceProductType, normalizedFieldName, status: "pending" }]
      : [
          { normalizedFieldName, status: "rejected" },
          { sourceProductType, normalizedFieldName, status: "pending" },
        ],
    take: 2,
  });
  return (
    candidates.find((candidate) => candidate.status === "rejected") ??
    candidates.find((candidate) => candidate.status === "pending") ??
    null
  );
}

function stringFromRaw(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function dateFromRaw(value: unknown): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(String(value));
}
