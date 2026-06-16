import { DataSource } from "typeorm";
import { Pump } from "../../entity/crm/productPump.js";
import { Filter } from "../../entity/crm/productFilter.js";
import { ExtractionResults } from "./extraction/entity/extractionResults.entity.js";

export type ProductConfigAgentModelTermType = "metering_pump_model" | "filter_model";
export type ProductConfigAgentMasterDataSource =
  | "crm_products_pump"
  | "crm_product_filter";

export interface ProductConfigAgentMasterDataMatch {
  matched: boolean;
  source: ProductConfigAgentMasterDataSource;
  id?: string;
  model?: string | null;
  rawValue: string;
  matchMethod?:
    | "model_exact"
    | "model_trim_exact"
    | "model_case_insensitive"
    | "model_normalized"
    | "attributes_unique_exact";
  details?: Record<string, unknown>;
}

export interface ProductConfigAgentAttributeMatchReviewCandidate {
  id: string;
  model: string | null;
  source: ProductConfigAgentMasterDataSource;
  matchedAttributes: string[];
  details: Record<string, unknown>;
}

export interface ProductConfigAgentAttributeMatchResult {
  masterDataMatch: ProductConfigAgentMasterDataMatch;
  matchedAttributes: string[];
  candidateCount: number;
  candidates: ProductConfigAgentAttributeMatchReviewCandidate[];
  reason:
    | "matched"
    | "insufficient_attributes"
    | "no_match"
    | "multiple_matches";
}

export interface ProductConfigAgentMasterDataCandidate {
  id: string;
  model: string | null;
  name?: string | null;
  source: ProductConfigAgentMasterDataSource;
  details: Record<string, unknown>;
}

const MODEL_TERM_TYPE_SOURCE: Record<
  ProductConfigAgentModelTermType,
  ProductConfigAgentMasterDataSource
> = {
  metering_pump_model: "crm_products_pump",
  filter_model: "crm_product_filter",
};

const ATTRIBUTE_TERM_TYPE_MAP: Record<
  ProductConfigAgentModelTermType,
  Array<{ termType: string; masterField: string }>
> = {
  filter_model: [
    { termType: "dimension", masterField: "dimension" },
    { termType: "weight", masterField: "weight" },
    { termType: "filter_diameter", masterField: "filterDiameter" },
    { termType: "effective_filter_area", masterField: "effectiveFilterArea" },
    { termType: "capacity", masterField: "production" },
  ],
  metering_pump_model: [
    { termType: "pump_displacement", masterField: "pumpage" },
    { termType: "rotation_speed", masterField: "rotateSpeed" },
    { termType: "heating_power", masterField: "heatingPower" },
    { termType: "capacity", masterField: "production" },
  ],
};

export function isProductConfigAgentModelTermType(
  termType: string,
): termType is ProductConfigAgentModelTermType {
  return termType === "metering_pump_model" || termType === "filter_model";
}

export function sourceForModelTermType(
  termType: ProductConfigAgentModelTermType,
): ProductConfigAgentMasterDataSource {
  return MODEL_TERM_TYPE_SOURCE[termType];
}

export function normalizeMasterDataModel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[._\-\/\\|,;:()\[\]{}<>]/g, "");
}

export function normalizeMasterDataAttribute(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\uff10-\uff19]/g, (char) =>
      String(char.charCodeAt(0) - 0xff10),
    )
    .replace(/[，。；：、]/g, "")
    .replace(/[‐‑‒–—－]/g, "-")
    .replace(/[×＊*]/g, "x")
    .replace(/平方厘米|平方公分|cm²|㎠/gi, "cm2")
    .replace(/毫米/gi, "mm")
    .replace(/厘米/gi, "cm")
    .replace(/公斤/gi, "kg")
    .replace(/千克/gi, "kg")
    .replace(/每小时|\/小时|每时/gi, "/h")
    .replace(/\/+/g, "/")
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]{}<>]/g, "");
}

export class ProductConfigAgentMasterDataService {
  private pumpModelRows?: Promise<Pump[]>;
  private filterModelRows?: Promise<Filter[]>;

  constructor(private readonly dataSource: DataSource) {}

  async matchModel(params: {
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
  }): Promise<ProductConfigAgentMasterDataMatch> {
    const source = sourceForModelTermType(params.termType);
    const rawValue = String(params.rawValue ?? "");
    const trimmed = rawValue.trim();

    if (!trimmed) {
      return { matched: false, source, rawValue };
    }

    if (params.termType === "metering_pump_model") {
      return this.matchPumpModel(rawValue);
    }

    return this.matchFilterModel(rawValue);
  }

  async searchMeteringPumps(
    model: string,
  ): Promise<ProductConfigAgentMasterDataCandidate[]> {
    const rows = await this.searchByModel(Pump, model, "pump");
    return rows.map((row) => this.mapPump(row as Pump));
  }

  async searchFilters(model: string): Promise<ProductConfigAgentMasterDataCandidate[]> {
    const rows = await this.searchByModel(Filter, model, "filter");
    return rows.map((row) => this.mapFilter(row as Filter));
  }

  async bindModel(params: {
    documentId: string | number;
    extractionResultId: string | number;
    itemIndex: number;
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    source: ProductConfigAgentMasterDataSource;
    masterDataId: string | number;
  }): Promise<{ ok: true; masterDataMatch: ProductConfigAgentMasterDataMatch }> {
    const expectedSource = sourceForModelTermType(params.termType);
    if (params.source !== expectedSource) {
      throw new Error(
        `source must be ${expectedSource} for termType ${params.termType}`,
      );
    }

    const masterDataMatch = await this.getMatchById({
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataId: params.masterDataId,
    });

    const repo = this.dataSource.getRepository(ExtractionResults);
    const extraction = await repo.findOne({
      where: {
        id: Number(params.extractionResultId),
        documentId: Number(params.documentId),
      },
    });
    if (!extraction) {
      throw new Error("Extraction result not found");
    }

    extraction.normalizedExtractionJson = this.applyBindingToNormalizedJson({
      json: extraction.normalizedExtractionJson,
      itemIndex: params.itemIndex,
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataMatch,
    });
    extraction.dictionaryProposals = this.applyBindingToDictionaryProposals({
      json: extraction.dictionaryProposals,
      itemIndex: params.itemIndex,
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataMatch,
    });
    await repo.save(extraction);

    return { ok: true, masterDataMatch };
  }

  async matchModelByAttributes(params: {
    termType: ProductConfigAgentModelTermType;
    attributes: Record<string, string[]>;
  }): Promise<ProductConfigAgentAttributeMatchResult> {
    if (params.termType === "metering_pump_model") {
      return this.matchRowsByAttributes({
        termType: params.termType,
        source: "crm_products_pump",
        rows: await this.getModelRows(Pump, "pump"),
        attributes: params.attributes,
        details: (row) => this.pumpDetails(row as Pump),
      });
    }

    return this.matchRowsByAttributes({
      termType: params.termType,
      source: "crm_product_filter",
      rows: await this.getModelRows(Filter, "filter"),
      attributes: params.attributes,
      details: (row) => this.filterDetails(row as Filter),
    });
  }

  private async matchPumpModel(
    rawValue: string,
  ): Promise<ProductConfigAgentMasterDataMatch> {
    const row = await this.findBestModelMatch(Pump, rawValue, "pump");
    if (!row) {
      return {
        matched: false,
        source: "crm_products_pump",
        rawValue,
      };
    }

    return {
      matched: true,
      source: "crm_products_pump",
      id: String(row.entity.id),
      model: row.entity.model,
      rawValue,
      matchMethod: row.matchMethod,
      details: this.pumpDetails(row.entity),
    };
  }

  private async matchFilterModel(
    rawValue: string,
  ): Promise<ProductConfigAgentMasterDataMatch> {
    const row = await this.findBestModelMatch(Filter, rawValue, "filter");
    if (!row) {
      return {
        matched: false,
        source: "crm_product_filter",
        rawValue,
      };
    }

    return {
      matched: true,
      source: "crm_product_filter",
      id: String(row.entity.id),
      model: row.entity.model,
      rawValue,
      matchMethod: row.matchMethod,
      details: this.filterDetails(row.entity),
    };
  }

  private matchRowsByAttributes<T extends { id: unknown; model: string | null }>(
    params: {
      termType: ProductConfigAgentModelTermType;
      source: ProductConfigAgentMasterDataSource;
      rows: T[];
      attributes: Record<string, string[]>;
      details: (row: T) => Record<string, unknown>;
    },
  ): ProductConfigAgentAttributeMatchResult {
    const mappings = ATTRIBUTE_TERM_TYPE_MAP[params.termType];
    const usableAttributes = Object.fromEntries(
      Object.entries(params.attributes)
        .map(([termType, values]) => [
          termType,
          [...new Set(values.map(normalizeMasterDataAttribute).filter(Boolean))],
        ])
        .filter(([, values]) => values.length > 0),
    ) as Record<string, string[]>;
    const providedMappedAttributes = mappings.filter(
      (mapping) => (usableAttributes[mapping.termType] ?? []).length > 0,
    );
    if (providedMappedAttributes.length < 2) {
      return {
        masterDataMatch: {
          matched: false,
          source: params.source,
          rawValue: "",
          details: {
            providedAttributes: Object.keys(usableAttributes),
            requiredMatchCount: 2,
          },
        },
        matchedAttributes: [],
        candidateCount: 0,
        candidates: [],
        reason: "insufficient_attributes",
      };
    }

    const candidates: Array<{
      row: T;
      matchedAttributes: string[];
    }> = [];
    for (const row of params.rows) {
      const matchedAttributes: string[] = [];
      let hasConflict = false;

      for (const mapping of providedMappedAttributes) {
        const masterValue = normalizeMasterDataAttribute((row as any)[mapping.masterField]);
        if (!masterValue) {
          continue;
        }
        const values = usableAttributes[mapping.termType] ?? [];
        if (values.includes(masterValue)) {
          matchedAttributes.push(mapping.termType);
        } else {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict && matchedAttributes.length >= 2) {
        candidates.push({ row, matchedAttributes });
      }
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      return {
        masterDataMatch: {
          matched: true,
          source: params.source,
          id: String(candidate.row.id),
          model: candidate.row.model ?? undefined,
          rawValue: candidate.row.model ?? "",
          matchMethod: "attributes_unique_exact",
          details: {
            ...params.details(candidate.row),
            matchedAttributes: candidate.matchedAttributes,
            sourceAttributes: usableAttributes,
          },
        },
        matchedAttributes: candidate.matchedAttributes,
        candidateCount: 1,
        candidates: [
          {
            id: String(candidate.row.id),
            model: candidate.row.model,
            source: params.source,
            matchedAttributes: candidate.matchedAttributes,
            details: params.details(candidate.row),
          },
        ],
        reason: "matched",
      };
    }

    return {
      masterDataMatch: {
        matched: false,
        source: params.source,
        rawValue: "",
        details: {
          providedAttributes: usableAttributes,
          candidateCount: candidates.length,
        },
      },
      matchedAttributes: [],
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 10).map((candidate) => ({
        id: String(candidate.row.id),
        model: candidate.row.model,
        source: params.source,
        matchedAttributes: candidate.matchedAttributes,
        details: params.details(candidate.row),
      })),
      reason: candidates.length > 1 ? "multiple_matches" : "no_match",
    };
  }

  private async getMatchById(params: {
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    masterDataId: string | number;
  }): Promise<ProductConfigAgentMasterDataMatch> {
    if (params.termType === "metering_pump_model") {
      const row = await this.dataSource.getRepository(Pump).findOne({
        where: { id: Number(params.masterDataId) as any },
      });
      if (!row) throw new Error("Pump master data not found");
      return {
        matched: true,
        source: "crm_products_pump",
        id: String(row.id),
        model: row.model,
        rawValue: params.rawValue,
        matchMethod: "model_exact",
        details: this.pumpDetails(row),
      };
    }

    const row = await this.dataSource.getRepository(Filter).findOne({
      where: { id: Number(params.masterDataId) },
    });
    if (!row) throw new Error("Filter master data not found");
    return {
      matched: true,
      source: "crm_product_filter",
      id: String(row.id),
      model: row.model,
      rawValue: params.rawValue,
      matchMethod: "model_exact",
      details: this.filterDetails(row),
    };
  }

  private async findBestModelMatch<T extends { model: string | null }>(
    entity: { new (): T },
    rawValue: string,
    alias: string,
  ): Promise<
    | {
        entity: T;
        matchMethod: NonNullable<ProductConfigAgentMasterDataMatch["matchMethod"]>;
      }
    | null
  > {
    const raw = String(rawValue ?? "");
    const trimmed = raw.trim();
    const normalized = normalizeMasterDataModel(trimmed);
    const candidates = await this.getModelRows(entity, alias);

    const exact = candidates.find((candidate) => candidate.model === raw);
    if (exact) return { entity: exact, matchMethod: "model_exact" };

    if (trimmed !== raw) {
      const trimExact = candidates.find(
        (candidate) => candidate.model === trimmed,
      );
      if (trimExact) {
        return { entity: trimExact, matchMethod: "model_trim_exact" };
      }
    }

    const lowerTrimmed = trimmed.toLowerCase();
    const caseInsensitive = candidates.find(
      (candidate) => String(candidate.model ?? "").toLowerCase() === lowerTrimmed,
    );
    if (caseInsensitive) {
      return {
        entity: caseInsensitive,
        matchMethod: "model_case_insensitive",
      };
    }

    const normalizedMatch = candidates.find(
      (candidate) => normalizeMasterDataModel(candidate.model) === normalized,
    );
    return normalizedMatch
      ? { entity: normalizedMatch, matchMethod: "model_normalized" }
      : null;
  }

  private async getModelRows<T extends { model: string | null }>(
    entity: { new (): T },
    alias: string,
  ): Promise<T[]> {
    if (alias === "pump") {
      this.pumpModelRows ??= this.loadModelRows(Pump, alias);
      return (await this.pumpModelRows) as unknown as T[];
    }

    if (alias === "filter") {
      this.filterModelRows ??= this.loadModelRows(Filter, alias);
      return (await this.filterModelRows) as unknown as T[];
    }

    return this.loadModelRows(entity, alias);
  }

  private async loadModelRows<T extends { model: string | null }>(
    entity: { new (): T },
    alias: string,
  ): Promise<T[]> {
    return this.dataSource
      .getRepository(entity)
      .createQueryBuilder(alias)
      .where(`${alias}.model IS NOT NULL`)
      .andWhere(`${alias}.model <> ''`)
      .getMany();
  }

  private async searchByModel<T extends { model: string | null }>(
    entity: { new (): T },
    model: string,
    alias: string,
  ): Promise<T[]> {
    const repo = this.dataSource.getRepository(entity);
    const keyword = String(model ?? "").trim();
    const normalized = normalizeMasterDataModel(keyword);
    const rows = keyword
      ? await repo
          .createQueryBuilder(alias)
          .where(`${alias}.model IS NOT NULL`)
          .andWhere(`${alias}.model <> ''`)
          .take(5000)
          .getMany()
      : await repo
          .createQueryBuilder(alias)
          .where(`${alias}.model IS NOT NULL`)
          .andWhere(`${alias}.model <> ''`)
          .take(50)
          .getMany();

    const normalizedRows = keyword
      ? rows.filter((row) => {
          const rowModel = String(row.model ?? "");
          return (
            rowModel.toLowerCase().includes(keyword.toLowerCase()) ||
            normalizeMasterDataModel(rowModel).includes(normalized)
          );
        })
      : rows;
    const merged = new Map<string, T>();
    for (const row of [...normalizedRows, ...rows]) {
      const id = String((row as any).id);
      merged.set(id, row);
      if (merged.size >= 50) break;
    }
    return [...merged.values()];
  }

  private mapPump(row: Pump): ProductConfigAgentMasterDataCandidate {
    return {
      id: String(row.id),
      model: row.model,
      source: "crm_products_pump",
      details: this.pumpDetails(row),
    };
  }

  private mapFilter(row: Filter): ProductConfigAgentMasterDataCandidate {
    return {
      id: String(row.id),
      model: row.model,
      name: row.name,
      source: "crm_product_filter",
      details: this.filterDetails(row),
    };
  }

  private pumpDetails(row: Pump): Record<string, unknown> {
    return {
      pumpage: row.pumpage,
      rotateSpeed: row.rotateSpeed,
      heatingPower: row.heatingPower,
      shearSensitivity: row.shearSensitivity,
      production: row.production,
      remark: row.remark,
    };
  }

  private filterDetails(row: Filter): Record<string, unknown> {
    return {
      name: row.name,
      filterBoard: row.filterBoard,
      production: row.production,
      dimension: row.dimension,
      weight: row.weight,
      filterDiameter: row.filterDiameter,
      effectiveFilterArea: row.effectiveFilterArea,
      power: row.power,
      pressure: row.pressure,
      remark: row.remark,
    };
  }

  private applyBindingToNormalizedJson(params: {
    json: unknown;
    itemIndex: number;
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    masterDataMatch: ProductConfigAgentMasterDataMatch;
  }): unknown {
    if (!isObject(params.json) || !Array.isArray(params.json.items)) {
      return params.json;
    }

    for (const item of params.json.items as any[]) {
      if (Number(item?.item_index) !== Number(params.itemIndex)) continue;
      for (const field of Array.isArray(item.fields) ? item.fields : []) {
        if (
          field?.dictionary?.term_type === params.termType &&
          String(field?.raw_value ?? "") === params.rawValue
        ) {
          field.dictionary.masterDataMatch = {
            ...params.masterDataMatch,
            confirmed: true,
          };
          field.warnings = (field.warnings ?? []).filter(
            (warning: any) => warning?.type !== "master_data_no_match",
          );
        }
      }
    }
    return params.json;
  }

  private applyBindingToDictionaryProposals(params: {
    json: unknown;
    itemIndex: number;
    termType: ProductConfigAgentModelTermType;
    rawValue: string;
    masterDataMatch: ProductConfigAgentMasterDataMatch;
  }): unknown {
    if (!isObject(params.json)) return params.json;
    this.applyBindingToNormalizedJson({
      json: params.json,
      itemIndex: params.itemIndex,
      termType: params.termType,
      rawValue: params.rawValue,
      masterDataMatch: params.masterDataMatch,
    });
    if (Array.isArray((params.json as any).warnings)) {
      (params.json as any).warnings = (params.json as any).warnings.filter(
        (warning: any) =>
          !(
            warning?.type === "master_data_no_match" &&
            warning?.item_index === params.itemIndex &&
            warning?.term_type === params.termType &&
            String(warning?.raw_value ?? "") === params.rawValue
          ),
      );
    }
    return params.json;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
