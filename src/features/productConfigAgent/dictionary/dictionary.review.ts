import { DataSource, In, Repository } from "typeorm";
import {
  DictionaryAlias,
  DictionaryCandidate,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryTermTypeCandidate,
  DictionaryCandidateOccurrence,
  SplitResolution,
} from "./entity/index.js";
import type { DictionaryValueKind } from "./dictionary.types.js";
import { normalizeText } from "./dictionary.utils.js";

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

type TermTypeBatchReviewOperation = {
  candidateId: string;
  action: "create_term_type" | "approve_term_type_as_alias";
  payload: any;
};

type TermTypeCandidateBatchResult = {
  candidateId: string;
  action: string;
  status: "ok" | "failed";
  error?: string;
};

function compactStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function sqlJson(value: unknown): string {
  return JSON.stringify(value);
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

export async function reviewTermTypeCandidatesBatch(
  dataSource: DataSource,
  operations: TermTypeBatchReviewOperation[],
): Promise<TermTypeCandidateBatchResult[]> {
  if (operations.length === 0) {
    return [];
  }

  const candidateRepo = dataSource.getRepository(DictionaryTermTypeCandidate);
  const candidateIds = [...new Set(operations.map((item) => item.candidateId))];
  const candidates = await candidateRepo.findBy({ id: In(candidateIds) });
  const candidatesById = new Map(candidates.map((item) => [String(item.id), item]));

  const requestedTermTypes = new Set<string>();
  for (const operation of operations) {
    const termType = String(operation.payload?.termType ?? "").trim();
    if (termType) {
      requestedTermTypes.add(termType);
    }
  }

  const existingTermTypes = requestedTermTypes.size
    ? await dataSource
        .getRepository(DictionaryTermType)
        .findBy({ termType: In([...requestedTermTypes]) })
    : [];
  const termTypesByName = new Map(
    existingTermTypes.map((item) => [item.termType, item]),
  );

  const termTypeRows = new Map<string, any>();
  const termTypeAliasRows = new Map<string, any>();
  const enumValueRows = new Map<string, any>();
  const enumValueAliasRows = new Map<string, any>();
  const approvedKeys = new Map<string, string>();
  const candidateUpdates: Array<{
    id: string;
    proposed_term_type: string | null;
    reviewed_by: string | null;
    reviewed_at: Date;
    status: string;
    reason: string | null;
  }> = [];
  const results: TermTypeCandidateBatchResult[] = [];

  const approvedLookupRows = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.sourceProductType}\u0000${candidate.normalizedFieldName}`,
        {
          source_product_type: candidate.sourceProductType,
          normalized_field_name: candidate.normalizedFieldName,
        },
      ]),
    ).values(),
  ];
  const approvedCandidates =
    approvedLookupRows.length > 0
      ? await dataSource.query(
          `
          SELECT approved.*
          FROM quote_agent.dictionary_term_type_candidates approved
          JOIN jsonb_to_recordset($1::jsonb) AS input(
            source_product_type text,
            normalized_field_name text
          )
            ON approved.source_product_type = input.source_product_type
           AND approved.normalized_field_name = input.normalized_field_name
          WHERE approved.status = 'approved'
          `,
          [sqlJson(approvedLookupRows)],
        )
      : [];
  for (const candidate of approvedCandidates) {
    approvedKeys.set(
      `${candidate.source_product_type ?? candidate.sourceProductType}\u0000${
        candidate.normalized_field_name ?? candidate.normalizedFieldName
      }`,
      String(candidate.id),
    );
  }

  for (const operation of operations) {
    const candidate = candidatesById.get(operation.candidateId);
    if (!candidate) {
      results.push({
        candidateId: operation.candidateId,
        action: operation.action,
        status: "failed",
        error: `DictionaryTermTypeCandidate not found: ${operation.candidateId}`,
      });
      continue;
    }

    const termType = String(operation.payload?.termType ?? "").trim();
    if (!termType) {
      results.push({
        candidateId: operation.candidateId,
        action: operation.action,
        status: "failed",
        error: "termType is required",
      });
      continue;
    }

    const existingTermType = termTypesByName.get(termType);
    if (operation.action === "approve_term_type_as_alias" && !existingTermType) {
      results.push({
        candidateId: operation.candidateId,
        action: operation.action,
        status: "failed",
        error: `DictionaryTermType not found: ${termType}`,
      });
      continue;
    }

    const applicableProductTypes =
      operation.action === "create_term_type"
        ? normalizeApplicableProductTypes(
            operation.payload?.applicableProductTypes,
            candidate.sourceProductType,
          )
        : operation.payload?.appendApplicableProductType
          ? appendApplicableProductType(
              existingTermType?.applicableProductTypes,
              candidate.sourceProductType,
            )
          : existingTermType?.applicableProductTypes;
    const valueKind =
      operation.payload?.valueKind ?? existingTermType?.valueKind ?? "enum";

    if (operation.action === "create_term_type") {
      termTypeRows.set(termType, {
        term_type: termType,
        display_name: String(operation.payload?.displayName ?? "").trim() || termType,
        quote_display_name:
          operation.payload?.quoteDisplayName === undefined
            ? existingTermType?.quoteDisplayName ?? null
            : String(operation.payload?.quoteDisplayName ?? "").trim() || null,
        description:
          operation.payload?.description === undefined
            ? existingTermType?.description ?? null
            : String(operation.payload?.description ?? "").trim() || null,
        category:
          operation.payload?.category === undefined
            ? existingTermType?.category ?? null
            : String(operation.payload?.category ?? "").trim() || null,
        sort_order:
          Number.isFinite(Number(operation.payload?.sortOrder))
            ? Number(operation.payload.sortOrder)
            : existingTermType?.sortOrder ?? 100,
        value_kind: valueKind,
        applicable_product_types: applicableProductTypes ?? [],
      });
    } else if (
      operation.payload?.valueKind !== undefined ||
      operation.payload?.appendApplicableProductType
    ) {
      termTypeRows.set(termType, {
        term_type: termType,
        display_name: existingTermType?.displayName ?? termType,
        quote_display_name: existingTermType?.quoteDisplayName ?? null,
        description: existingTermType?.description ?? null,
        category: existingTermType?.category ?? null,
        sort_order: existingTermType?.sortOrder ?? 100,
        value_kind: valueKind,
        applicable_product_types: applicableProductTypes ?? [],
      });
    }

    const aliasPairs = new Map<string, string>();
    aliasPairs.set(candidateAliasKey(candidate.rawFieldName), candidate.rawFieldName);
    for (const aliasName of compactStringArray(operation.payload?.aliasNames)) {
      const normalizedAliasName = candidateAliasKey(aliasName);
      if (normalizedAliasName) {
        aliasPairs.set(normalizedAliasName, aliasName);
      }
    }
    for (const [normalizedAliasName, aliasName] of aliasPairs) {
      termTypeAliasRows.set(normalizedAliasName, {
        term_type: termType,
        alias_name: aliasName,
        normalized_alias_name: normalizedAliasName,
      });
    }

    const valueCanonicalValue = String(
      operation.payload?.valueCanonicalValue ?? "",
    ).trim();
    if ((valueKind === "enum" || valueKind === "enums") && valueCanonicalValue) {
      const valueKey = `${termType}\u0000${valueCanonicalValue}`;
      enumValueRows.set(valueKey, {
        term_type: termType,
        canonical_value: valueCanonicalValue,
        display_name:
          operation.payload?.valueDisplayName === undefined
            ? null
            : String(operation.payload?.valueDisplayName ?? "").trim() || null,
        fallback_display_name:
          String(operation.payload?.valueDisplayName ?? "").trim() ||
          candidate.rawValue ||
          valueCanonicalValue,
      });

      const valueAliases = new Map<string, string>();
      if (candidate.rawValue) {
        valueAliases.set(normalizeText(candidate.rawValue), candidate.rawValue);
      }
      for (const aliasName of compactStringArray(operation.payload?.valueAliasNames)) {
        const normalizedAlias = normalizeText(aliasName);
        if (normalizedAlias) {
          valueAliases.set(normalizedAlias, aliasName);
        }
      }
      for (const [normalizedAlias, aliasValue] of valueAliases) {
        enumValueAliasRows.set(`${termType}\u0000${normalizedAlias}`, {
          term_type: termType,
          canonical_value: valueCanonicalValue,
          normalized_alias: normalizedAlias,
          alias_value: aliasValue,
          confidence: Number(candidate.confidence ?? 0.9),
        });
      }
    }

    const approvedKey = `${candidate.sourceProductType}\u0000${candidate.normalizedFieldName}`;
    const existingApprovedId = approvedKeys.get(approvedKey);
    const status =
      existingApprovedId && existingApprovedId !== candidate.id
        ? doneStatus(candidate.id)
        : "approved";
    const reason =
      status === "approved"
        ? candidate.reason
        : `merged_to_approved_candidate:${existingApprovedId}`;
    if (status === "approved") {
      approvedKeys.set(approvedKey, candidate.id);
    }
    candidateUpdates.push({
      id: candidate.id,
      proposed_term_type: termType,
      reviewed_by: operation.payload?.reviewedBy ?? null,
      reviewed_at: new Date(),
      status,
      reason,
    });
    results.push({
      candidateId: operation.candidateId,
      action: operation.action,
      status: "ok",
    });
  }

  if (candidateUpdates.length === 0) {
    return results;
  }

  await dataSource.transaction(async (manager) => {
    const termTypeValues = [...termTypeRows.values()];
    if (termTypeValues.length > 0) {
      await manager.query(
        `
        INSERT INTO quote_agent.dictionary_term_types(
          term_type, display_name, quote_display_name, description, category,
          sort_order, value_kind, applicable_product_types, is_active
        )
        SELECT term_type, display_name, quote_display_name, description, category,
          sort_order, value_kind, applicable_product_types::jsonb, true
        FROM jsonb_to_recordset($1::jsonb) AS input(
          term_type text,
          display_name text,
          quote_display_name text,
          description text,
          category text,
          sort_order int,
          value_kind text,
          applicable_product_types jsonb
        )
        ON CONFLICT(term_type)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          quote_display_name = EXCLUDED.quote_display_name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          sort_order = EXCLUDED.sort_order,
          value_kind = EXCLUDED.value_kind,
          applicable_product_types = EXCLUDED.applicable_product_types,
          is_active = true,
          updated_at = now()
        `,
        [sqlJson(termTypeValues)],
      );
    }

    const termTypeAliasValues = [...termTypeAliasRows.values()];
    if (termTypeAliasValues.length > 0) {
      await manager.query(
        `
        INSERT INTO quote_agent.dictionary_term_type_aliases(
          term_type, alias_name, normalized_alias_name, description, source,
          usage_count, last_seen_at, is_active
        )
        SELECT term_type, alias_name, normalized_alias_name, null, 'candidate_review',
          0, null, true
        FROM jsonb_to_recordset($1::jsonb) AS input(
          term_type text,
          alias_name text,
          normalized_alias_name text
        )
        ON CONFLICT(normalized_alias_name)
        DO UPDATE SET
          term_type = EXCLUDED.term_type,
          alias_name = EXCLUDED.alias_name,
          source = 'candidate_review',
          is_active = true,
          updated_at = now()
        WHERE quote_agent.dictionary_term_type_aliases.is_active = false
        `,
        [sqlJson(termTypeAliasValues)],
      );
    }

    const enumValueValues = [...enumValueRows.values()];
    if (enumValueValues.length > 0) {
      await manager.query(
        `
        INSERT INTO quote_agent.dictionary_terms(
          term_type, canonical_value, display_name, description, is_active
        )
        SELECT term_type, canonical_value, COALESCE(display_name, fallback_display_name), null, true
        FROM jsonb_to_recordset($1::jsonb) AS input(
          term_type text,
          canonical_value text,
          display_name text,
          fallback_display_name text
        )
        ON CONFLICT(term_type, canonical_value) DO NOTHING
        `,
        [sqlJson(enumValueValues)],
      );

      await manager.query(
        `
        UPDATE quote_agent.dictionary_terms target
        SET
          is_active = true,
          display_name = CASE
            WHEN input.display_name IS NULL THEN target.display_name
            ELSE input.display_name
          END,
          updated_at = now()
        FROM jsonb_to_recordset($1::jsonb) AS input(
          term_type text,
          canonical_value text,
          display_name text
        )
        WHERE target.term_type = input.term_type
          AND target.canonical_value = input.canonical_value
        `,
        [sqlJson(enumValueValues)],
      );
    }

    const enumValueAliasValues = [...enumValueAliasRows.values()];
    if (enumValueAliasValues.length > 0) {
      await manager.query(
        `
        WITH input_rows AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS input(
            term_type text,
            canonical_value text,
            normalized_alias text,
            alias_value text,
            confidence numeric
          )
        ),
        resolved_rows AS (
          SELECT input_rows.*, terms.id AS term_id
          FROM input_rows
          JOIN quote_agent.dictionary_terms terms
            ON terms.term_type = input_rows.term_type
           AND terms.canonical_value = input_rows.canonical_value
        )
        INSERT INTO quote_agent.dictionary_aliases(
          term_id, term_type, alias_value, normalized_alias, confidence, source,
          usage_count, last_seen_at, risk_level, note, is_active
        )
        SELECT term_id, term_type, alias_value, normalized_alias,
          COALESCE(confidence, 0.9), 'candidate_review', 0, null, 'normal', null, true
        FROM resolved_rows
        ON CONFLICT(term_type, normalized_alias)
        DO UPDATE SET
          term_id = EXCLUDED.term_id,
          alias_value = EXCLUDED.alias_value,
          confidence = EXCLUDED.confidence,
          source = 'candidate_review',
          risk_level = 'normal',
          is_active = true,
          updated_at = now()
        WHERE quote_agent.dictionary_aliases.is_active = false
          OR quote_agent.dictionary_aliases.term_id IS DISTINCT FROM EXCLUDED.term_id
        `,
        [sqlJson(enumValueAliasValues)],
      );
    }

    await manager.query(
      `
      UPDATE quote_agent.dictionary_term_type_candidates target
      SET
        proposed_term_type = input.proposed_term_type,
        reviewed_by = input.reviewed_by,
        reviewed_at = input.reviewed_at,
        status = input.status,
        reason = input.reason,
        updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS input(
        id bigint,
        proposed_term_type text,
        reviewed_by text,
        reviewed_at timestamp,
        status text,
        reason text
      )
      WHERE target.id = input.id
      `,
      [sqlJson(candidateUpdates)],
    );
  });

  return results;
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
      canonicalValue?: string;
      displayName?: string;
      aliasNames?: string[];
      applicableProductTypes?: string[];
    }>;
    reviewedBy?: string;
  },
): Promise<void> {
  const candidateRepo = dataSource.getRepository(DictionaryCandidate);
  const termTypeRepo = dataSource.getRepository(DictionaryTermType);
  const termRepo = dataSource.getRepository(DictionaryTerm);
  const aliasRepo = dataSource.getRepository(DictionaryAlias);

  const candidate = await candidateRepo.findOne({
    where: { id: params.candidateId },
  });
  if (!candidate) {
    throw new Error(`DictionaryCandidate not found: ${params.candidateId}`);
  }

  const normalizedSplits = params.splits
    .map((split) => {
      const canonicalValue = String(split.canonicalValue ?? "").trim();
      const displayName = String(split.displayName ?? "").trim();
      const rawValue =
        String(split.rawValue ?? "").trim() || displayName || canonicalValue;
      return {
        termType: String(split.termType ?? "").trim(),
        rawValue,
        canonicalValue,
        displayName,
        aliasNames: compactStringArray(split.aliasNames),
        applicableProductTypes: normalizeApplicableProductTypes(
          split.applicableProductTypes,
          candidate.sourceProductType,
        ),
      };
    })
    .filter((split) => split.termType && split.rawValue);

  if (normalizedSplits.length === 0) {
    throw new Error("splits is required");
  }

  for (const split of normalizedSplits) {
    const termTypeRecord = await termTypeRepo.findOne({
      where: { termType: split.termType },
    });
    if (!termTypeRecord) {
      throw new Error(`DictionaryTermType not found: ${split.termType}`);
    }

    const valueKind = termTypeRecord.valueKind;
    if (
      (valueKind === "enum" || valueKind === "enums") &&
      split.canonicalValue
    ) {
      const term = await ensureDictionaryTermValue({
        termRepo,
        termType: split.termType,
        canonicalValue: split.canonicalValue,
        displayName: split.displayName || split.rawValue,
        fallbackDisplayName: split.displayName || split.rawValue,
      });
      const valueAliases = new Set<string>();
      valueAliases.add(split.rawValue);
      if (split.displayName) valueAliases.add(split.displayName);
      for (const aliasName of split.aliasNames) {
        valueAliases.add(aliasName);
      }
      for (const aliasValue of valueAliases) {
        await ensureValueAliasByRaw({
          aliasRepo,
          term,
          termType: split.termType,
          aliasValue,
          confidence: candidate.confidence,
        });
      }
    }
  }

  candidate.proposedTermId = null;
  candidate.proposedCanonicalValue = normalizedSplits
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
  const splitFields = normalizedSplits
    .map((split) => ({
      field_name: split.termType,
      value: split.rawValue,
      raw_text: candidate.rawValue,
      confidence: candidate.confidence ? Number(candidate.confidence) : undefined,
    }))
    .filter((item) => item.field_name && item.value);

  if (splitFields.length === 0) {
    throw new Error("splits is required");
  }

  for (const occurrence of occurrences) {
    const rawValue = occurrence.rawValue ?? candidate.rawValue;
    await splitResolutionRepo.delete({
      extractionResultId: occurrence.extractionResultId,
      itemIndex: occurrence.itemIndex,
      rawFieldName: occurrence.fieldName,
      rawValue,
      source: "candidate_review",
    });
    await splitResolutionRepo.save(
      splitResolutionRepo.create({
        documentId: occurrence.documentId,
        extractionResultId: occurrence.extractionResultId,
        itemIndex: occurrence.itemIndex,
        rawFieldName: occurrence.fieldName,
        rawValue,
        rawText: rawValue,
        splitFields,
        evidence: occurrence.evidence ?? candidate.evidence ?? null,
        source: "candidate_review",
      }),
    );
  }
}

export async function splitTermTypeCandidate(
  dataSource: DataSource,
  params: {
    candidateId: string;
    splits: Array<{
      termType: string;
      displayName?: string;
      valueKind?: DictionaryValueKind;
      rawValue?: string;
      canonicalValue?: string;
      aliasNames?: string[];
      valueAliasNames?: string[];
      applicableProductTypes?: string[];
    }>;
    reviewedBy?: string;
  },
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const candidateRepo = manager.getRepository(DictionaryTermTypeCandidate);
    const termTypeRepo = manager.getRepository(DictionaryTermType);
    const termTypeAliasRepo = manager.getRepository(DictionaryTermTypeAlias);
    const termRepo = manager.getRepository(DictionaryTerm);
    const valueAliasRepo = manager.getRepository(DictionaryAlias);

    const candidate = await candidateRepo.findOne({
      where: { id: params.candidateId },
    });
    if (!candidate) {
      throw new Error(
        `DictionaryTermTypeCandidate not found: ${params.candidateId}`,
      );
    }

    const normalizedSplits = params.splits
      .map((split) => ({
        termType: String(split.termType ?? "").trim(),
        displayName: String(split.displayName ?? "").trim() || undefined,
        valueKind: (String(split.valueKind ?? "").trim() ||
          "text") as DictionaryValueKind,
        rawValue: String(split.rawValue ?? "").trim() || undefined,
        canonicalValue: String(split.canonicalValue ?? "").trim() || undefined,
        aliasNames: compactStringArray(split.aliasNames),
        valueAliasNames: compactStringArray(split.valueAliasNames),
        applicableProductTypes: normalizeApplicableProductTypes(
          split.applicableProductTypes,
          candidate.sourceProductType,
        ),
      }))
      .filter(
        (split) =>
          split.termType &&
          (split.rawValue || split.canonicalValue || split.displayName),
      );

    if (normalizedSplits.length === 0) {
      throw new Error("splits is required");
    }

    for (const split of normalizedSplits) {
      let termType = await termTypeRepo.findOne({
        where: { termType: split.termType },
      });
      if (!termType) {
        termType = await termTypeRepo.save(
          termTypeRepo.create({
            termType: split.termType,
            displayName: split.displayName ?? split.termType,
            quoteDisplayName: null,
            description: null,
            category: "product_config",
            sortOrder: 100,
            valueKind: split.valueKind,
            applicableProductTypes: split.applicableProductTypes,
            isActive: true,
          }),
        );
      } else {
        if (split.displayName) {
          termType.displayName = split.displayName;
        }
        if (!termType.valueKind) {
          termType.valueKind = split.valueKind;
        }
        if (!termType.applicableProductTypes?.length) {
          termType.applicableProductTypes = split.applicableProductTypes;
        }
        termType.isActive = true;
        await termTypeRepo.save(termType);
      }

      const aliasNames = new Set<string>();
      if (split.displayName) {
        aliasNames.add(split.displayName);
      }
      for (const aliasName of split.aliasNames) {
        aliasNames.add(aliasName);
      }
      for (const aliasName of aliasNames) {
        const normalizedAliasName = candidateAliasKey(aliasName);
        if (!normalizedAliasName) continue;
        await ensureTermTypeAlias({
          aliasRepo: termTypeAliasRepo,
          termType: split.termType,
          aliasName,
          normalizedAliasName,
        });
      }

      const valueKind = termType.valueKind ?? split.valueKind;
      if (
        (valueKind === "enum" || valueKind === "enums") &&
        split.canonicalValue
      ) {
        const term = await ensureDictionaryTermValue({
          termRepo,
          termType: split.termType,
          canonicalValue: split.canonicalValue,
          displayName: split.rawValue ?? split.displayName,
          fallbackDisplayName:
            split.rawValue ?? split.displayName ?? split.canonicalValue,
        });
        const valueAliases = new Set<string>();
        if (split.rawValue) {
          valueAliases.add(split.rawValue);
        }
        for (const aliasName of split.valueAliasNames) {
          valueAliases.add(aliasName);
        }
        for (const aliasValue of valueAliases) {
          await ensureValueAliasByRaw({
            aliasRepo: valueAliasRepo,
            term,
            termType: split.termType,
            aliasValue,
            confidence: candidate.confidence,
          });
        }
      }
    }

    candidate.proposedTermType = normalizedSplits.map((item) => item.termType).join("|");
    candidate.reviewedBy = params.reviewedBy ?? null;
    candidate.reviewedAt = new Date();
    candidate.reason = "resolved_by_term_type_split";
    await saveTermTypeCandidateAsApproved(candidateRepo, candidate);

    const occurrenceRepo = manager.getRepository(DictionaryCandidateOccurrence);
    const splitResolutionRepo = manager.getRepository(SplitResolution);
    const occurrences = await occurrenceRepo.find({
      where: { candidateType: "term_type", candidateId: candidate.id },
    });
    const splitFields = normalizedSplits.map((split) => ({
      field_name: split.termType,
      value: split.rawValue ?? split.canonicalValue ?? split.displayName ?? "",
      raw_text: candidate.rawValue,
      confidence: candidate.confidence ? Number(candidate.confidence) : undefined,
    }));

    for (const occurrence of occurrences) {
      await splitResolutionRepo.save(
        splitResolutionRepo.create({
          documentId: occurrence.documentId,
          extractionResultId: occurrence.extractionResultId,
          itemIndex: occurrence.itemIndex,
          rawFieldName: occurrence.fieldName,
          rawValue: occurrence.rawValue ?? candidate.rawValue ?? "",
          rawText: occurrence.rawValue ?? candidate.rawValue ?? null,
          splitFields,
          evidence: occurrence.evidence ?? candidate.evidence ?? null,
          source: "candidate_review",
        }),
      );
    }
  });
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
