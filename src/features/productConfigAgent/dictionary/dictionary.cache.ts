import { DataSource } from "typeorm";
import {
  DictionaryAlias,
  DictionaryTerm,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryQualifier,
  DictionaryUnitAlias,
  DictionaryVersion,
} from "./entity/index.js";
import type {
  CachedTermType,
  CachedUnitAlias,
  CachedValueAlias,
  LlmDictionaryContext,
} from "./dictionary.types.js";
import { normalizeText, valueAliasKey } from "./dictionary.utils.js";
import {
  buildQualifierMatcher,
  type QualifierMatcher,
} from "./qualifierMatcher.js";

export class DictionaryCache {
  readonly termTypeAliasMap = new Map<string, string[]>();
  readonly termTypeAliasIdMap = new Map<string, string[]>();
  readonly termTypePromptAliasMap = new Map<string, PromptAlias[]>();
  readonly valueAliasMap = new Map<string, CachedValueAlias>();
  readonly unitAliasMap = new Map<string, CachedUnitAlias>();
  readonly termTypeMap = new Map<string, CachedTermType>();
  qualifierMatcher: QualifierMatcher = buildQualifierMatcher([]);

  private loadedVersion: number | null = null;
  private lastLoadedAt = 0;
  private ensureFreshPromise: Promise<void> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheTtlMs = 60000,
  ) {}

  async ensureFresh(): Promise<void> {
    if (this.ensureFreshPromise) {
      await this.ensureFreshPromise;
      return;
    }

    this.ensureFreshPromise = this.ensureFreshOnce();
    try {
      await this.ensureFreshPromise;
    } finally {
      this.ensureFreshPromise = null;
    }
  }

  private async ensureFreshOnce(): Promise<void> {
    if (this.loadedVersion === null) {
      await this.reload();
      return;
    }

    if (Date.now() - this.lastLoadedAt < this.cacheTtlMs) {
      return;
    }

    const version = await this.dataSource
      .getRepository(DictionaryVersion)
      .findOne({ where: { versionKey: "dictionary" } });
    const dbVersion = version ? Number(version.versionValue) : 0;

    if (dbVersion !== this.loadedVersion) {
      await this.reload();
      return;
    }

    this.lastLoadedAt = Date.now();
  }

  async reload(): Promise<void> {
    this.termTypeAliasMap.clear();
    this.termTypeAliasIdMap.clear();
    this.termTypePromptAliasMap.clear();
    this.valueAliasMap.clear();
    this.unitAliasMap.clear();
    this.termTypeMap.clear();

    const [termTypes, qualifiers] = await Promise.all([
      this.dataSource
        .getRepository(DictionaryTermType)
        .find({
          where: { isActive: true },
          order: { sortOrder: "ASC" },
        }),
      this.dataSource
        .getRepository(DictionaryQualifier)
        .find({
          where: { isActive: true },
          order: { sortOrder: "ASC" },
        }),
    ]);
    this.qualifierMatcher = buildQualifierMatcher(
      qualifiers.map((qualifier) => ({
        qualifierKey: qualifier.qualifierKey,
        kind: qualifier.kind,
        displayName: qualifier.displayName,
        aliases: qualifier.aliases,
        sortOrder: qualifier.sortOrder,
      })),
    );

    for (const termType of termTypes) {
      this.termTypeMap.set(termType.termType, {
        termType: termType.termType,
        displayName: termType.displayName,
        quoteDisplayName: termType.quoteDisplayName,
        category: termType.category,
        sortOrder: termType.sortOrder,
        valueKind: termType.valueKind,
        applicableProductTypes: Array.isArray(termType.applicableProductTypes)
          ? termType.applicableProductTypes
          : [],
      });

      this.registerTermTypeAlias(normalizeText(termType.termType), termType.termType);
      this.registerTermTypeAlias(
        normalizeText(termType.displayName),
        termType.termType,
      );
      this.registerTermTypeAlias(
        normalizeText(termType.quoteDisplayName),
        termType.termType,
      );
      this.registerTermTypePromptAlias(termType.termType, termType.displayName);
      this.registerTermTypePromptAlias(
        termType.termType,
        termType.quoteDisplayName,
      );
    }

    const termTypeAliases = await this.dataSource
      .getRepository(DictionaryTermTypeAlias)
      .find({ where: { isActive: true } });

    for (const alias of termTypeAliases) {
      const existingTermTypes =
        this.termTypeAliasMap.get(alias.normalizedAliasName) ?? [];
      if (!existingTermTypes.includes(alias.termType)) {
        existingTermTypes.push(alias.termType);
      }
      this.termTypeAliasMap.set(alias.normalizedAliasName, existingTermTypes);
      this.registerTermTypeAliasId(alias.normalizedAliasName, alias.id);

      this.registerTermTypePromptAlias(alias.termType, {
        value: alias.aliasName,
        usageCount: alias.usageCount,
        source: alias.source,
      });
    }

    const valueAliases = await this.dataSource
      .getRepository(DictionaryAlias)
      .createQueryBuilder("alias")
      .innerJoinAndSelect("alias.term", "term", "term.is_active = :isActive", {
        isActive: true,
      })
      .where("alias.is_active = :isActive", { isActive: true })
      .getMany();

    for (const alias of valueAliases) {
      this.registerValueAlias(alias.termType, alias.normalizedAlias, {
        termType: alias.termType,
        termId: alias.termId,
        aliasId: alias.id,
        canonicalValue: alias.term.canonicalValue,
        displayName: alias.term.displayName ?? undefined,
        confidence: Number(alias.confidence),
        riskLevel: alias.riskLevel,
        note: alias.note,
      });
    }

    const activeTerms = await this.dataSource
      .getRepository(DictionaryTerm)
      .find({ where: { isActive: true } });

    for (const term of activeTerms) {
      this.registerValueAlias(term.termType, normalizeText(term.canonicalValue), {
        termType: term.termType,
        termId: term.id,
        canonicalValue: term.canonicalValue,
        displayName: term.displayName ?? undefined,
        confidence: 1,
        riskLevel: "normal",
        note: "intrinsic_term_value",
      });
      this.registerValueAlias(term.termType, normalizeText(term.displayName), {
        termType: term.termType,
        termId: term.id,
        canonicalValue: term.canonicalValue,
        displayName: term.displayName ?? undefined,
        confidence: 1,
        riskLevel: "normal",
        note: "intrinsic_term_display_name",
      });
    }

    const unitAliases = await this.dataSource
      .getRepository(DictionaryUnitAlias)
      .find({ where: { isActive: true } });
    for (const alias of unitAliases) {
      this.unitAliasMap.set(alias.normalizedAlias, {
        id: alias.id,
        canonicalUnit: alias.canonicalUnit,
        displayUnit: alias.displayUnit,
        aliasValue: alias.aliasValue,
      });
    }

    const version = await this.dataSource
      .getRepository(DictionaryVersion)
      .findOne({ where: { versionKey: "dictionary" } });

    this.loadedVersion = version ? Number(version.versionValue) : 0;
    this.lastLoadedAt = Date.now();
  }

  async bumpVersion(): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO quote_agent.dictionary_versions(version_key, version_value)
      VALUES ($1, 1)
      ON CONFLICT(version_key)
      DO UPDATE SET
        version_value = quote_agent.dictionary_versions.version_value + 1,
        updated_at = now()
      `,
      ["dictionary"],
    );
    await this.reload();
  }

  async getLlmDictionaryContext(): Promise<LlmDictionaryContext> {
    await this.ensureFresh();

    const toAliases = (termType: string) =>
      selectPromptAliases(this.termTypePromptAliasMap.get(termType) ?? [], 6);
    const productTypeTerms = await this.dataSource
      .getRepository(DictionaryTerm)
      .find({
        where: { termType: "product_type", isActive: true },
        order: { displayName: "ASC" },
      });
    const productTypeAliases = await this.dataSource
      .getRepository(DictionaryAlias)
      .find({ where: { termType: "product_type", isActive: true } });
    const aliasesByTermId = new Map<string, PromptAlias[]>();
    for (const alias of productTypeAliases) {
      const aliases = aliasesByTermId.get(alias.termId) ?? [];
      aliases.push({
        value: alias.aliasValue,
        usageCount: alias.usageCount,
        source: alias.source,
        confidence: Number(alias.confidence),
        riskLevel: alias.riskLevel,
      });
      aliasesByTermId.set(alias.termId, aliases);
    }

    return {
      product_types: productTypeTerms.map((term) => ({
        canonical_value: term.canonicalValue,
        display_name: term.displayName ?? term.canonicalValue,
        description: term.description ?? null,
        aliases: selectPromptAliases(aliasesByTermId.get(term.id) ?? [], 8),
      })),
      term_types: [...this.termTypeMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((termType) => ({
          term_type: termType.termType,
          display_name: termType.displayName,
          quote_display_name: termType.quoteDisplayName ?? null,
          category: termType.category ?? null,
          value_kind: termType.valueKind,
          applicable_product_types: termType.applicableProductTypes ?? [],
          aliases: toAliases(termType.termType),
        })),
    };
  }

  private registerTermTypeAlias(
    normalizedAliasName: string,
    termType: string,
  ): void {
    if (!normalizedAliasName) {
      return;
    }

    const existingTermTypes =
      this.termTypeAliasMap.get(normalizedAliasName) ?? [];
    if (!existingTermTypes.includes(termType)) {
      existingTermTypes.push(termType);
    }
    this.termTypeAliasMap.set(normalizedAliasName, existingTermTypes);
  }

  private registerTermTypePromptAlias(
    termType: string,
    alias: PromptAlias | string | null,
  ): void {
    const promptAlias =
      typeof alias === "string" ? { value: alias } : alias;
    if (!promptAlias?.value) {
      return;
    }

    const aliases = this.termTypePromptAliasMap.get(termType) ?? [];
    const existing = aliases.find((item) => item.value === promptAlias.value);
    if (existing) {
      existing.usageCount = Math.max(
        Number(existing.usageCount ?? 0),
        Number(promptAlias.usageCount ?? 0),
      );
    } else {
      aliases.push(promptAlias);
    }
    this.termTypePromptAliasMap.set(termType, aliases);
  }

  private registerTermTypeAliasId(
    normalizedAliasName: string,
    aliasId: string,
  ): void {
    if (!normalizedAliasName) {
      return;
    }

    const existingAliasIds = this.termTypeAliasIdMap.get(normalizedAliasName) ?? [];
    if (!existingAliasIds.includes(aliasId)) {
      existingAliasIds.push(aliasId);
    }
    this.termTypeAliasIdMap.set(normalizedAliasName, existingAliasIds);
  }

  private registerValueAlias(
    termType: string,
    normalizedAlias: string,
    value: CachedValueAlias,
  ): void {
    if (!normalizedAlias) {
      return;
    }
    const key = valueAliasKey(termType, normalizedAlias);
    if (!this.valueAliasMap.has(key)) {
      this.valueAliasMap.set(key, value);
    }
  }
}

type PromptAlias = {
  value: string;
  usageCount?: number;
  source?: string | null;
  confidence?: number;
  riskLevel?: string | null;
};

function selectPromptAliases(aliases: PromptAlias[], limit: number): string[] {
  const seen = new Set<string>();
  return aliases
    .filter((alias) => {
      const value = alias.value?.trim();
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort((left, right) => promptAliasScore(right) - promptAliasScore(left))
    .slice(0, limit)
    .map((alias) => alias.value);
}

function promptAliasScore(alias: PromptAlias): number {
  const sourceScore =
    alias.source === "manual" ? 20 : alias.source === "system" ? 10 : 0;
  const riskPenalty = alias.riskLevel && alias.riskLevel !== "normal" ? -20 : 0;
  const confidenceScore = Math.round(Number(alias.confidence ?? 1) * 10);
  const usageScore = Math.min(50, Number(alias.usageCount ?? 0));
  const lengthPenalty = Math.max(0, alias.value.length - 24) * 0.1;
  return sourceScore + riskPenalty + confidenceScore + usageScore - lengthPenalty;
}
