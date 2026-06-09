import { DataSource, Repository } from "typeorm";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryTermTypeCandidate,
  DictionaryCandidateOccurrence,
} from "./entity";
import { SplitResolution } from "../entity/splitResolution.entity";
import type { DictionaryValueKind } from "./dictionary.types";
import { normalizeText } from "./dictionary.utils";

async function ensureValueAlias(params: {
  aliasRepo: Repository<DictionaryAlias>;
  term: DictionaryTerm;
  candidate: DictionaryCandidate;
}) {
  const existingAlias = await params.aliasRepo.findOne({
    where: {
      termType: params.candidate.termType,
      normalizedAlias: params.candidate.normalizedRawValue,
    },
  });

  if (!existingAlias) {
    await params.aliasRepo.save(
      params.aliasRepo.create({
        termId: params.term.id,
        termType: params.candidate.termType,
        aliasValue: params.candidate.rawValue,
        normalizedAlias: params.candidate.normalizedRawValue,
        confidence: params.candidate.confidence ?? "0.9",
        source: "candidate_review",
        usageCount: 0,
        lastSeenAt: null,
        riskLevel: "normal",
        note: null,
        isActive: true,
      }),
    );
    return;
  }

  if (!existingAlias.isActive || existingAlias.termId !== params.term.id) {
    existingAlias.termId = params.term.id;
    existingAlias.aliasValue = params.candidate.rawValue;
    existingAlias.confidence =
      params.candidate.confidence ?? existingAlias.confidence;
    existingAlias.source = "candidate_review";
    existingAlias.riskLevel = "normal";
    existingAlias.isActive = true;
    await params.aliasRepo.save(existingAlias);
  }
}

async function ensureValueAliasByRaw(params: {
  aliasRepo: Repository<DictionaryAlias>;
  term: DictionaryTerm;
  termType: string;
  aliasValue: string;
  confidence?: string | null;
}) {
  const normalizedAlias = normalizeText(params.aliasValue);
  if (!normalizedAlias) {
    return;
  }

  const existingAlias = await params.aliasRepo.findOne({
    where: {
      termType: params.termType,
      normalizedAlias,
    },
  });

  if (!existingAlias) {
    await params.aliasRepo.save(
      params.aliasRepo.create({
        termId: params.term.id,
        termType: params.termType,
        aliasValue: params.aliasValue,
        normalizedAlias,
        confidence: params.confidence ?? "0.9",
        source: "candidate_review",
        usageCount: 0,
        lastSeenAt: null,
        riskLevel: "normal",
        note: null,
        isActive: true,
      }),
    );
    return;
  }

  if (!existingAlias.isActive || existingAlias.termId !== params.term.id) {
    existingAlias.termId = params.term.id;
    existingAlias.aliasValue = params.aliasValue;
    existingAlias.confidence = params.confidence ?? existingAlias.confidence;
    existingAlias.source = "candidate_review";
    existingAlias.riskLevel = "normal";
    existingAlias.isActive = true;
    await params.aliasRepo.save(existingAlias);
  }
}

async function ensureDictionaryTermValue(params: {
  termRepo: Repository<DictionaryTerm>;
  termType: string;
  canonicalValue: string;
  displayName?: string;
  fallbackDisplayName: string;
}): Promise<DictionaryTerm> {
  let term = await params.termRepo.findOne({
    where: {
      termType: params.termType,
      canonicalValue: params.canonicalValue,
    },
  });

  if (!term) {
    return params.termRepo.save(
      params.termRepo.create({
        termType: params.termType,
        canonicalValue: params.canonicalValue,
        displayName: params.displayName ?? params.fallbackDisplayName,
        description: null,
        isActive: true,
      }),
    );
  }

  if (!term.isActive || params.displayName !== undefined) {
    term.isActive = true;
    term.displayName = params.displayName ?? term.displayName;
    term = await params.termRepo.save(term);
  }

  return term;
}

async function ensureEnumValueForTermTypeCandidate(params: {
  termRepo: Repository<DictionaryTerm>;
  aliasRepo: Repository<DictionaryAlias>;
  termType: string;
  valueKind: DictionaryValueKind;
  candidate: DictionaryTermTypeCandidate;
  canonicalValue?: string;
  displayName?: string;
  aliasNames?: string[];
}) {
  const canonicalValue = String(params.canonicalValue ?? "").trim();
  if (params.valueKind !== "enum" && params.valueKind !== "enums" || !canonicalValue) {
    return;
  }

  let term = await params.termRepo.findOne({
    where: {
      termType: params.termType,
      canonicalValue,
    },
  });

  if (!term) {
    term = await params.termRepo.save(
      params.termRepo.create({
        termType: params.termType,
        canonicalValue,
        displayName:
          String(params.displayName ?? "").trim() ||
          params.candidate.rawValue ||
          canonicalValue,
        description: null,
        isActive: true,
      }),
    );
  } else if (!term.isActive || params.displayName !== undefined) {
    term.isActive = true;
    term.displayName =
      String(params.displayName ?? "").trim() || term.displayName;
    term = await params.termRepo.save(term);
  }

  const aliases = new Set<string>();
  if (params.candidate.rawValue) {
    aliases.add(params.candidate.rawValue);
  }
  for (const alias of params.aliasNames ?? []) {
    const trimmed = String(alias ?? "").trim();
    if (trimmed) {
      aliases.add(trimmed);
    }
  }

  for (const aliasValue of aliases) {
    await ensureValueAliasByRaw({
      aliasRepo: params.aliasRepo,
      term,
      termType: params.termType,
      aliasValue,
      confidence: params.candidate.confidence,
    });
  }
}

async function ensureTermTypeAlias(params: {
  aliasRepo: Repository<DictionaryTermTypeAlias>;
  termType: string;
  aliasName: string;
  normalizedAliasName: string;
}) {
  const existingAlias = await params.aliasRepo.findOne({
    where: {
      termType: params.termType,
      normalizedAliasName: params.normalizedAliasName,
    },
  });

  if (!existingAlias) {
    await params.aliasRepo.save(
      params.aliasRepo.create({
        termType: params.termType,
        aliasName: params.aliasName,
        normalizedAliasName: params.normalizedAliasName,
        description: null,
        source: "candidate_review",
        usageCount: 0,
        lastSeenAt: null,
        isActive: true,
      }),
    );
    return;
  }

  if (!existingAlias.isActive) {
    existingAlias.aliasName = params.aliasName;
    existingAlias.source = "candidate_review";
    existingAlias.isActive = true;
    await params.aliasRepo.save(existingAlias);
  }
}

async function ensureTermTypeAliases(params: {
  aliasRepo: Repository<DictionaryTermTypeAlias>;
  termType: string;
  candidate: DictionaryTermTypeCandidate;
  aliasNames?: string[];
}) {
  const normalizedAliases = new Map<string, string>();
  normalizedAliases.set(
    candidateAliasKey(params.candidate.rawFieldName),
    params.candidate.rawFieldName,
  );

  for (const aliasName of params.aliasNames ?? []) {
    const trimmed = String(aliasName ?? "").trim();
    const normalized = candidateAliasKey(trimmed);
    if (trimmed && normalized) {
      normalizedAliases.set(normalized, trimmed);
    }
  }

  for (const [normalizedAliasName, aliasName] of normalizedAliases) {
    await ensureTermTypeAlias({
      aliasRepo: params.aliasRepo,
      termType: params.termType,
      aliasName,
      normalizedAliasName,
    });
  }
}

function candidateAliasKey(value: string) {
  return normalizeText(value);
}

function doneStatus(id: string) {
  return `done_${String(id).slice(-24)}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return (
    candidate?.code === "23505" ||
    String(candidate?.message ?? "").includes("duplicate key value")
  );
}

async function saveValueCandidateAsApproved(
  candidateRepo: Repository<DictionaryCandidate>,
  candidate: DictionaryCandidate,
) {
  const existingApproved = await candidateRepo.findOne({
    where: {
      termType: candidate.termType,
      normalizedRawValue: candidate.normalizedRawValue,
      status: "approved",
    },
  });

  if (existingApproved && existingApproved.id !== candidate.id) {
    candidate.status = doneStatus(candidate.id);
    candidate.reason = `merged_to_approved_candidate:${existingApproved.id}`;
  } else {
    candidate.status = "approved";
  }

  try {
    await candidateRepo.save(candidate);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    candidate.status = doneStatus(candidate.id);
    candidate.reason = candidate.reason ?? "merged_to_existing_reviewed_candidate";
    await candidateRepo.save(candidate);
  }
}

async function saveTermTypeCandidateAsApproved(
  candidateRepo: Repository<DictionaryTermTypeCandidate>,
  candidate: DictionaryTermTypeCandidate,
) {
  const existingApproved = await candidateRepo.findOne({
    where: {
      sourceProductType: candidate.sourceProductType,
      normalizedFieldName: candidate.normalizedFieldName,
      status: "approved",
    },
  });

  if (existingApproved && existingApproved.id !== candidate.id) {
    candidate.status = doneStatus(candidate.id);
    candidate.reason = `merged_to_approved_candidate:${existingApproved.id}`;
  } else {
    candidate.status = "approved";
  }

  try {
    await candidateRepo.save(candidate);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    candidate.status = doneStatus(candidate.id);
    candidate.reason = candidate.reason ?? "merged_to_existing_reviewed_candidate";
    await candidateRepo.save(candidate);
  }
}

export async function approveValueCandidateAsAlias(
  dataSource: DataSource,
  params: {
    candidateId: string;
    termId: string;
    reviewedBy?: string;
    aliasNames?: string[];
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const termRepo = dataSource.getRepository(DictionaryTerm);
  const aliasRepo = dataSource.getRepository(DictionaryAlias);

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
  }

  const term = await termRepo.findOne({ where: { id: params.termId } });
  if (!term) {
    throw new Error(`DictionaryTerm not found: ${params.termId}`);
  }

  await ensureValueAlias({ aliasRepo, term, candidate });
  for (const aliasName of params.aliasNames ?? []) {
    const trimmed = String(aliasName ?? "").trim();
    if (!trimmed) continue;
    await ensureValueAliasByRaw({
      aliasRepo,
      term,
      termType: candidate.termType,
      aliasValue: trimmed,
      confidence: candidate.confidence,
    });
  }

  candidate.proposedTermId = term.id;
  candidate.proposedCanonicalValue = term.canonicalValue;
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  await saveValueCandidateAsApproved(candidateRepo, candidate);
}

export async function createValueFromCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    canonicalValue: string;
    displayName?: string;
    reviewedBy?: string;
    aliasNames?: string[];
    values?: Array<{
      canonicalValue: string;
      displayName?: string;
      aliasNames?: string[];
    }>;
    suppressCandidateRawAlias?: boolean;
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const termRepo = dataSource.getRepository(DictionaryTerm);
  const aliasRepo = dataSource.getRepository(DictionaryAlias);

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
  }

  const values = [
    {
      canonicalValue: params.canonicalValue,
      displayName: params.displayName,
      aliasNames: params.aliasNames,
    },
    ...(params.values ?? []),
  ]
    .map((value) => ({
      canonicalValue: String(value.canonicalValue ?? "").trim(),
      displayName:
        value.displayName === undefined
          ? undefined
          : String(value.displayName ?? "").trim() || undefined,
      aliasNames: value.aliasNames,
    }))
    .filter((value) => value.canonicalValue);

  const terms: DictionaryTerm[] = [];
  for (const value of values) {
    const term = await ensureDictionaryTermValue({
      termRepo,
      termType: candidate.termType,
      canonicalValue: value.canonicalValue,
      displayName: value.displayName,
      fallbackDisplayName: value.displayName ?? value.canonicalValue,
    });
    terms.push(term);

    for (const aliasName of value.aliasNames ?? []) {
      const trimmed = String(aliasName ?? "").trim();
      if (!trimmed) continue;
      await ensureValueAliasByRaw({
        aliasRepo,
        term,
        termType: candidate.termType,
        aliasValue: trimmed,
        confidence: candidate.confidence,
      });
    }
  }

  const term = terms[0];
  if (!term) {
    throw new Error("canonicalValue is required");
  }
  if (!params.suppressCandidateRawAlias) {
    await ensureValueAlias({ aliasRepo, term, candidate });
  }

  candidate.proposedTermId = term.id;
  candidate.proposedCanonicalValue = term.canonicalValue;
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  await saveValueCandidateAsApproved(candidateRepo, candidate);
}

export async function splitValueCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    splits: Array<{
      termType: string;
      rawValue?: string;
    }>;
    reviewedBy?: string;
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const termTypeRepo = dataSource.getRepository(DictionaryTermType);

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
  }

  for (const split of params.splits) {
    const termType = String(split.termType ?? "").trim();
    const rawValue = String(split.rawValue ?? "").trim();
    if (!termType || !rawValue) continue;

    const termTypeRecord = await termTypeRepo.findOne({
      where: { termType },
    });
    if (!termTypeRecord) {
      throw new Error(`DictionaryTermType not found: ${termType}`);
    }
  }

  candidate.proposedTermId = null;
  candidate.proposedCanonicalValue = params.splits
    .map((item) => `${item.termType}:${item.rawValue}`)
    .join("|");
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  candidate.reason = "resolved_by_value_split";
  await saveValueCandidateAsApproved(candidateRepo, candidate);

  const occurrenceRepo = dataSource.getRepository(DictionaryCandidateOccurrence);
  const splitResolutionRepo = dataSource.getRepository(SplitResolution);
  const occurrences = await occurrenceRepo.find({
    where: { candidateType: "value", candidateId: candidate.id },
  });
  const splitFields = params.splits
    .map((split) => ({
      field_name: split.termType,
      value: String(split.rawValue ?? "").trim(),
      raw_text: candidate.rawValue,
      confidence: candidate.confidence ? Number(candidate.confidence) : undefined,
    }))
    .filter((item) => item.field_name && item.value);

  for (const occurrence of occurrences) {
    await splitResolutionRepo.save(
      splitResolutionRepo.create({
        documentId: occurrence.documentId,
        extractionResultId: occurrence.extractionResultId,
        itemIndex: occurrence.itemIndex,
        rawFieldName: occurrence.fieldName,
        rawValue: occurrence.rawValue ?? candidate.rawValue,
        rawText: occurrence.rawValue ?? candidate.rawValue,
        splitFields,
        evidence: occurrence.evidence ?? candidate.evidence ?? null,
        source: "candidate_review",
      }),
    );
  }
}

export async function approveTermTypeCandidateAsAlias(
  dataSource: DataSource,
  params: {
    candidateId: string;
    termType: string;
    reviewedBy?: string;
    valueKind?: DictionaryValueKind;
    aliasNames?: string[];
    valueCanonicalValue?: string;
    valueDisplayName?: string;
    valueAliasNames?: string[];
    appendApplicableProductType?: boolean;
  },
): Promise<void> {
  const termTypeRepo = dataSource.getRepository(DictionaryTermType);
  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const aliasRepo = dataSource.getRepository(DictionaryTermTypeAlias);
  const termRepo = dataSource.getRepository(DictionaryTerm);
  const valueAliasRepo = dataSource.getRepository(DictionaryAlias);

  const termType = await termTypeRepo.findOne({
    where: { termType: params.termType },
  });
  if (!termType) {
    throw new Error(`DictionaryTermType not found: ${params.termType}`);
  }

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(
      `DictionaryTermTypeCandidate not found: ${params.candidateId}`,
    );
  }

  if (params.valueKind !== undefined) {
    termType.valueKind = params.valueKind;
  }
  if (params.appendApplicableProductType) {
    termType.applicableProductTypes = appendApplicableProductType(
      termType.applicableProductTypes,
      candidate.sourceProductType,
    );
  }
  await termTypeRepo.save(termType);

  await ensureTermTypeAliases({
    aliasRepo,
    termType: params.termType,
    candidate,
    aliasNames: params.aliasNames,
  });

  await ensureEnumValueForTermTypeCandidate({
    termRepo,
    aliasRepo: valueAliasRepo,
    termType: params.termType,
    valueKind: termType.valueKind,
    candidate,
    canonicalValue: params.valueCanonicalValue,
    displayName: params.valueDisplayName,
    aliasNames: params.valueAliasNames,
  });

  candidate.proposedTermType = params.termType;
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  await saveTermTypeCandidateAsApproved(candidateRepo, candidate);
}

export async function createTermTypeFromCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    termType: string;
    displayName: string;
    quoteDisplayName?: string;
    description?: string;
    category?: string;
    sortOrder?: number;
    valueKind: DictionaryValueKind;
    reviewedBy?: string;
    aliasNames?: string[];
    valueCanonicalValue?: string;
    valueDisplayName?: string;
    valueAliasNames?: string[];
    applicableProductTypes?: string[];
  },
): Promise<void> {
  const termTypeRepo = dataSource.getRepository(DictionaryTermType);
  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const aliasRepo = dataSource.getRepository(DictionaryTermTypeAlias);
  const termRepo = dataSource.getRepository(DictionaryTerm);
  const valueAliasRepo = dataSource.getRepository(DictionaryAlias);

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(
      `DictionaryTermTypeCandidate not found: ${params.candidateId}`,
    );
  }

  let termType = await termTypeRepo.findOne({
    where: { termType: params.termType },
  });

  const applicableProductTypes = normalizeApplicableProductTypes(
    params.applicableProductTypes,
    candidate.sourceProductType,
  );

  if (!termType) {
    termType = await termTypeRepo.save(
      termTypeRepo.create({
        termType: params.termType,
        displayName: params.displayName,
        quoteDisplayName: params.quoteDisplayName ?? null,
        description: params.description ?? null,
        category: params.category ?? null,
        sortOrder: params.sortOrder ?? 100,
        valueKind: params.valueKind,
        applicableProductTypes,
        isActive: true,
      }),
    );
  } else {
    termType.displayName = params.displayName;
    termType.quoteDisplayName =
      params.quoteDisplayName ?? termType.quoteDisplayName;
    termType.description = params.description ?? termType.description;
    termType.category = params.category ?? termType.category;
    termType.sortOrder = params.sortOrder ?? termType.sortOrder;
    termType.valueKind = params.valueKind;
    termType.applicableProductTypes = applicableProductTypes;
    termType.isActive = true;
    await termTypeRepo.save(termType);
  }

  await ensureTermTypeAliases({
    aliasRepo,
    termType: params.termType,
    candidate,
    aliasNames: params.aliasNames,
  });

  await ensureEnumValueForTermTypeCandidate({
    termRepo,
    aliasRepo: valueAliasRepo,
    termType: params.termType,
    valueKind: params.valueKind,
    candidate,
    canonicalValue: params.valueCanonicalValue,
    displayName: params.valueDisplayName,
    aliasNames: params.valueAliasNames,
  });

  candidate.proposedTermType = params.termType;
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  await saveTermTypeCandidateAsApproved(candidateRepo, candidate);
}

function normalizeApplicableProductTypes(
  explicit: string[] | undefined,
  sourceProductType: string | null | undefined,
): string[] {
  const values = (explicit ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (values.length > 0) {
    return [...new Set(values)];
  }
  const source = String(sourceProductType ?? "").trim();
  return source && source !== "unknown" ? [source] : [];
}

function appendApplicableProductType(
  current: string[] | null | undefined,
  sourceProductType: string | null | undefined,
): string[] {
  const values = Array.isArray(current) ? current.filter(Boolean) : [];
  const source = String(sourceProductType ?? "").trim();
  if (!source || source === "unknown" || values.includes("common")) {
    return values;
  }
  return values.includes(source) ? values : [...values, source];
}

export async function rejectValueCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
  }

  candidate.status = "rejected";
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  candidate.reason = params.reason ?? candidate.reason;
  try {
    await candidateRepo.save(candidate);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    candidate.status = doneStatus(candidate.id);
    candidate.reason = `${params.reason ?? candidate.reason ?? "rejected"};merged_to_existing_rejected_candidate`;
    await candidateRepo.save(candidate);
  }
}

export async function rejectTermTypeCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    reviewedBy?: string;
    reason?: string;
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(
      `DictionaryTermTypeCandidate not found: ${params.candidateId}`,
    );
  }

  candidate.status = "rejected";
  candidate.reviewedBy = params.reviewedBy ?? null;
  candidate.reviewedAt = new Date();
  candidate.reason = params.reason ?? candidate.reason;
  try {
    await candidateRepo.save(candidate);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    candidate.status = doneStatus(candidate.id);
    candidate.reason = `${params.reason ?? candidate.reason ?? "rejected"};merged_to_existing_rejected_candidate`;
    await candidateRepo.save(candidate);
  }
}
