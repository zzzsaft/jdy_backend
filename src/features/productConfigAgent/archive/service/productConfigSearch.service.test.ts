import assert from "node:assert/strict";
import { ProductConfigSearchService } from "./productConfigSearch.service.js";

class FakeQueryBuilder {
  whereParams: Record<string, unknown> | undefined;
  customerParams: Record<string, unknown> | undefined;

  innerJoinAndSelect() {
    return this;
  }

  leftJoinAndSelect() {
    return this;
  }

  where(_sql: string, params?: Record<string, unknown>) {
    this.whereParams = params;
    return this;
  }

  andWhere(_sql: string, params?: Record<string, unknown>) {
    this.customerParams = params;
    return this;
  }

  orderBy() {
    return this;
  }

  addOrderBy() {
    return this;
  }

  async getMany() {
    return [];
  }
}

const builder = new FakeQueryBuilder();
const service = new ProductConfigSearchService({
  getRepository() {
    return {
      createQueryBuilder() {
        return builder;
      },
    };
  },
} as any);

const result = await service.searchProductConfigs({
  productNumber: " PN-001 ",
  customerId: "C-001",
  includeErp: true,
});

assert.equal(result.productNumber, "PN-001");
assert.equal(result.includeErp, true);
assert.equal(result.erpSearchEnabled, false);
assert.deepEqual(result.sources, { archiveBindings: true, erp: false });
assert.deepEqual(result.matches, []);
assert.deepEqual(builder.whereParams, { productNumber: "%PN-001%" });
assert.deepEqual(builder.customerParams, { customerId: "C-001" });

console.log("productConfigAgent product config search tests passed");
