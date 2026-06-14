import { DataSource } from "typeorm";
import { ContractArchiveItemProduct } from "../entity/index.js";
import { normalizeOptionalString } from "../utils/string.js";
import { mapProductConfigMatch } from "./contractArchive.mapper.js";

export class ProductConfigSearchService {
  constructor(private readonly dataSource: DataSource) {}

  async searchProductConfigs(params: {
    productNumber: string;
    customerId?: string;
    includeErp?: boolean;
  }) {
    const productNumber = normalizeOptionalString(params.productNumber);
    if (!productNumber) {
      throw new Error("productNumber is required");
    }

    const query = this.dataSource
      .getRepository(ContractArchiveItemProduct)
      .createQueryBuilder("binding")
      .innerJoinAndSelect("binding.item", "item")
      .innerJoinAndSelect("binding.archive", "archive")
      .leftJoinAndSelect("archive.document", "document")
      .where("binding.product_number ILIKE :productNumber", {
        productNumber: `%${productNumber}%`,
      })
      .orderBy("archive.updated_at", "DESC")
      .addOrderBy("item.item_index", "ASC");

    if (params.customerId) {
      query.andWhere("archive.customer_id = :customerId", {
        customerId: params.customerId,
      });
    }

    const rows = await query.getMany();
    return {
      productNumber,
      includeErp: params.includeErp === true,
      erpSearchEnabled: false,
      sources: {
        archiveBindings: true,
        erp: false,
      },
      matches: rows.map(mapProductConfigMatch),
    };
  }
}
