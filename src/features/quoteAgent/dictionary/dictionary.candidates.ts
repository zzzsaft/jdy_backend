import { DataSource } from "typeorm";
import {
  DictionaryCandidate,
  DictionaryTermTypeCandidate,
} from "./entity";
import type {
  CreateTermTypeCandidateParams,
  CreateValueCandidateParams,
} from "./dictionary.types";

export async function createValueCandidate(
  dataSource: DataSource,
  params: CreateValueCandidateParams,
  normalizedRawValue: string,
): Promise<DictionaryCandidate> {
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
  const existingCandidate = await candidateRepo.findOne({
    where: {
      termType: params.termType,
      normalizedRawValue,
      status: "pending",
    },
  });

  if (existingCandidate) {
    if (params.confidence !== undefined) {
      const existingConfidence =
        existingCandidate.confidence === null
          ? null
          : Number(existingCandidate.confidence);
      if (existingConfidence === null || params.confidence > existingConfidence) {
        existingCandidate.confidence = String(params.confidence);
      }
    }
    existingCandidate.documentId =
      params.documentId === undefined
        ? existingCandidate.documentId
        : params.documentId;
    existingCandidate.extractionResultId =
      params.extractionResultId === undefined
        ? existingCandidate.extractionResultId
        : params.extractionResultId;
    existingCandidate.itemIndex =
      params.itemIndex === undefined
        ? existingCandidate.itemIndex
        : params.itemIndex;
    existingCandidate.sourceProductType =
      sourceProductType === "unknown"
        ? existingCandidate.sourceProductType
        : sourceProductType;
    existingCandidate.reason = params.reason ?? existingCandidate.reason;
    // Merge enums context into evidence if available
    if (params.sourceRawValue !== undefined || params.splitFromRawValue !== undefined) {
      existingCandidate.evidence = {
        ...(existingCandidate.evidence && typeof existingCandidate.evidence === 'object' ? existingCandidate.evidence : {}),
        ...(params.sourceRawValue !== undefined ? { sourceRawValue: params.sourceRawValue } : {}),
        ...(params.splitFromRawValue !== undefined ? { splitFromRawValue: params.splitFromRawValue } : {}),
      };
    } else if (params.evidence !== undefined) {
      existingCandidate.evidence = params.evidence;
    }
    return candidateRepo.save(existingCandidate);
  }

  return candidateRepo.save(
    candidateRepo.create({
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
      confidence:
        params.confidence === undefined ? null : String(params.confidence),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
    }),
  );
}

export async function createTermTypeCandidate(
  dataSource: DataSource,
  params: CreateTermTypeCandidateParams,
  normalizedFieldName: string,
): Promise<DictionaryTermTypeCandidate> {
  if (!normalizedFieldName) {
    throw new Error("rawFieldName cannot be empty after normalization");
  }

  const sourceProductType = normalizeSourceProductType(params.sourceProductType);
  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const existingCandidate = await candidateRepo.findOne({
    where: {
      sourceProductType,
      normalizedFieldName,
      status: "pending",
    },
  });

  if (existingCandidate) {
    existingCandidate.rawValue =
      params.rawValue === undefined
        ? existingCandidate.rawValue
        : params.rawValue;
    existingCandidate.proposedTermType =
      params.proposedTermType === undefined
        ? existingCandidate.proposedTermType
        : params.proposedTermType;
    existingCandidate.reason = params.reason ?? existingCandidate.reason;
    existingCandidate.evidence =
      params.evidence === undefined
        ? existingCandidate.evidence
        : params.evidence;
    existingCandidate.confidence =
      params.confidence === undefined
        ? existingCandidate.confidence
        : String(params.confidence);
    existingCandidate.documentId =
      params.documentId === undefined
        ? existingCandidate.documentId
        : params.documentId;
    existingCandidate.extractionResultId =
      params.extractionResultId === undefined
        ? existingCandidate.extractionResultId
        : params.extractionResultId;
    existingCandidate.itemIndex =
      params.itemIndex === undefined
        ? existingCandidate.itemIndex
        : params.itemIndex;
    return candidateRepo.save(existingCandidate);
  }

  return candidateRepo.save(
    candidateRepo.create({
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
      confidence:
        params.confidence === undefined ? null : String(params.confidence),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
    }),
  );
}

function normalizeSourceProductType(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
}
