import { DataSource } from "typeorm";
import {
  DictionaryAlias,
  DictionaryTermType,
  DictionaryTermTypeAlias,
  DictionaryVersion,
} from "./entity";
import type {
  CachedTermType,
  CachedValueAlias,
  LlmDictionaryContext,
} from "./dictionary.types";
import { normalizeText, valueAliasKey } from "./dictionary.utils";

export class DictionaryCache {
  readonly termTypeAliasMap = new Map<string, string[]>();
  readonly termTypeAliasIdMap = new Map<string, string[]>();
  readonly termTypePromptAliasMap = new Map<string, Set<string>>();
  readonly valueAliasMap = new Map<string, CachedValueAlias>();
  readonly termTypeMap = new Map<string, CachedTermType>();

  private loadedVersion: number | null = null;
  private lastLoadedAt = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheTtlMs = 60000,
  ) {}

  async ensureFresh(): Promise<void> {
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
    this.termTypeMap.clear();

    const termTypes = await this.dataSource
      .getRepository(DictionaryTermType)
      .find({
        where: { isActive: true },
        order: { sortOrder: "ASC" },
      });

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

      const aliases =
        this.termTypePromptAliasMap.get(alias.termType) ?? new Set();
      aliases.add(alias.aliasName);
      this.termTypePromptAliasMap.set(alias.termType, aliases);
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
      const key = valueAliasKey(alias.termType, alias.normalizedAlias);
      this.valueAliasMap.set(key, {
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
      [...(this.termTypePromptAliasMap.get(termType) ?? [])].sort().slice(0, 8);

    return {
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
    aliasName: string | null,
  ): void {
    if (!aliasName) {
      return;
    }

    const aliases = this.termTypePromptAliasMap.get(termType) ?? new Set();
    aliases.add(aliasName);
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
}
