import type { ProductConfigTool } from "./types.js";
import { PgDataSource } from "../../../config/data-source.js";
import { DictionaryTerm, DictionaryTermType } from "../dictionary/entity/index.js";

export const getProductRulesTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    if (!PgDataSource.isInitialized) {
      return fallbackRules(entities);
    }

    const termTypes = await PgDataSource.getRepository(DictionaryTermType).find({
      where: { isActive: true },
      order: { sortOrder: "ASC", displayName: "ASC" },
      take: 200,
    });
    const productTypes = await PgDataSource.getRepository(DictionaryTerm).find({
      where: { termType: "product_type", isActive: true },
      order: { displayName: "ASC" },
      take: 200,
    });

    return {
      productType: entities.productType ?? null,
      productTypes: productTypes.map((item) => ({
        canonicalValue: item.canonicalValue,
        displayName: item.displayName ?? item.canonicalValue,
      })),
      fields: termTypes.map((item) => ({
        termType: item.termType,
        displayName: item.displayName,
        description: item.description,
        valueKind: item.valueKind,
        category: item.category,
        applicableProductTypes: item.applicableProductTypes,
      })),
    };
  },
};

function fallbackRules(entities: Record<string, any>) {
  return {
    productType: entities.productType ?? null,
    productTypes: [],
    fields: [],
    warnings: ["PgDataSource is not initialized; returned fallback product rules"],
  };
}

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object"
    ? (args.entities as Record<string, any>)
    : {};
}
