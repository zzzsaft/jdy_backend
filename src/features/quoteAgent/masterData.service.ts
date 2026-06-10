import { DataSource } from "typeorm";
import { Pump } from "../../entity/crm/productPump.js";
import { Filter } from "../../entity/crm/productFilter.js";
import { ExtractionResults } from "./entity/extractionResults.entity.js";

export type QuoteAgentModelTermType = "metering_pump_model" | "filter_model";
export type QuoteAgentMasterDataSource =
  | "crm_products_pump"
  | "crm_product_filter";

export interface QuoteAgentMasterDataMatch {
  matched: boolean;
  source: QuoteAgentMasterDataSource;
  id?: string;
  model?: string;
  rawValue: string;
  matchMethod?: "model_exact" | "model_trim_exact" | "model_case_insensitive" | "model_normalized";
  details?: Record<string, unknown>;
}

export interface QuoteAgentMasterDataCandidate {
  id: string;
  model: string | null;
  name?: string | null;
  source: QuoteAgentMasterDataSource;
  details: Record<string, unknown>;
}

const MODEL_TERM_TYPE_SOURCE: Record<
  QuoteAgentModelTermType,
  QuoteAgentMasterDataSource
> = {
  metering_pump_model: "crm_products_pump",
  filter_model: "crm_product_filter",
};

export function isQuoteAgentModelTermType(
  termType: string,
): termType is QuoteAgentModelTermType {
  return termType === "metering_pump_model" || termType === "filter_model";
}

export function sourceForModelTermType(
  termType: QuoteAgentModelTermType,
): QuoteAgentMasterDataSource {
  return MODEL_TERM_TYPE_SOURCE[termType];
}

export function normalizeMasterDataModel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[._\-\/\\|,;:()\[\]{}<>]/g, "");
}

export class QuoteAgentMasterDataService {
  private pumpModelRows?: Promise<Pump[]>;
  private filterModelRows?: Promise<Filter[]>;

  constructor(private readonly dataSource: DataSource) {}

  async matchModel(params: {
    termType: QuoteAgentModelTermType;
    rawValue: string;
  }): Promise<QuoteAgentMasterDataMatch> {
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
  ): Promise<QuoteAgentMasterDataCandidate[]> {
    const rows = await this.searchByModel(Pump, model, "pump");
    return rows.map((row) => this.mapPump(row as Pump));
  }

  async searchFilters(model: string): Promise<QuoteAgentMasterDataCandidate[]> {
    const rows = await this.searchByModel(Filter, model, "filter");
    return rows.map((row) => this.mapFilter(row as Filter));
  }

  async bindModel(params: {
    documentId: string | number;
    extractionResultId: string | number;
    itemIndex: number;
    termType: QuoteAgentModelTermType;
    rawValue: string;
    source: QuoteAgentMasterDataSource;
    masterDataId: string | number;
  }): Promise<{ ok: true; masterDataMatch: QuoteAgentMasterDataMatch }> {
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

  private async matchPumpModel(
    rawValue: string,
  ): Promise<QuoteAgentMasterDataMatch> {
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
  ): Promise<QuoteAgentMasterDataMatch> {
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

  private async getMatchById(params: {
    termType: QuoteAgentModelTermType;
    rawValue: string;
    masterDataId: string | number;
  }): Promise<QuoteAgentMasterDataMatch> {
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
        matchMethod: NonNullable<QuoteAgentMasterDataMatch["matchMethod"]>;
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

  private mapPump(row: Pump): QuoteAgentMasterDataCandidate {
    return {
      id: String(row.id),
      model: row.model,
      source: "crm_products_pump",
      details: this.pumpDetails(row),
    };
  }

  private mapFilter(row: Filter): QuoteAgentMasterDataCandidate {
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
    termType: QuoteAgentModelTermType;
    rawValue: string;
    masterDataMatch: QuoteAgentMasterDataMatch;
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
    termType: QuoteAgentModelTermType;
    rawValue: string;
    masterDataMatch: QuoteAgentMasterDataMatch;
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
