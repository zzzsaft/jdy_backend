import type { ProductConfigTool } from "./types.js";
import { PgDataSource } from "../../../config/data-source.js";
import { productConfigAgentArchiveService } from "../archive/contractArchive.service.js";

export const searchSimilarConfigsTool: ProductConfigTool = {
  async run(args) {
    const entities = readEntities(args);
    if (!entities.productNumber) {
      return {
        source: "archive_product_configs",
        supported: true,
        matches: [],
        warnings: ["productNumber is required for first-version archive search"],
      };
    }
    if (!PgDataSource.isInitialized) {
      return {
        source: "archive_product_configs",
        supported: true,
        matches: [],
        warnings: ["PgDataSource is not initialized; skipped archive search"],
      };
    }

    return productConfigAgentArchiveService.searchProductConfigs({
      productNumber: String(entities.productNumber),
      customerId: entities.customerId ? String(entities.customerId) : undefined,
      includeErp: false,
    });
  },
};

function readEntities(args: Record<string, unknown>): Record<string, any> {
  return args.entities && typeof args.entities === "object"
    ? (args.entities as Record<string, any>)
    : {};
}
