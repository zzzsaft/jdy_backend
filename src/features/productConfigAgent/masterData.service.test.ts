import assert from "node:assert/strict";
import {
  normalizeMasterDataAttribute,
  ProductConfigAgentMasterDataService,
} from "./masterData.service.js";
import { Filter } from "../../entity/crm/productFilter.js";
import { Pump } from "../../entity/crm/productPump.js";

function createDataSource(rowsByEntity: Map<any, any[]>) {
  return {
    getRepository(entity: any) {
      return {
        createQueryBuilder() {
          return {
            where() {
              return this;
            },
            andWhere() {
              return this;
            },
            getMany: async () => rowsByEntity.get(entity) ?? [],
          };
        },
      };
    },
  } as any;
}

assert.equal(normalizeMasterDataAttribute("2×78CM²"), "2x78cm2");
assert.equal(normalizeMasterDataAttribute("130－380kg以下/每小时"), "130-380kg以下/h");

const uniqueFilterService = new ProductConfigAgentMasterDataService(
  createDataSource(
    new Map<any, any[]>([
      [
        Filter,
        [
          {
            id: 1,
            model: "GD-DP-A-120",
            dimension: "L1(125mm)，L2（835mm），L3（220mm）",
            weight: "305kg",
            filterDiameter: "Φ100mm",
            effectiveFilterArea: "2×78CM2",
            production: "130－380kg以下/每小时",
          },
          {
            id: 2,
            model: "GD-DP-A-145",
            dimension: "L1(165mm)，L2（1000mm），L3（270mm）",
            weight: "490kg",
            filterDiameter: "Φ125mm",
            effectiveFilterArea: "2×123CM2",
            production: "300－700kg以下/每小时",
          },
        ],
      ],
    ]),
  ),
);
const uniqueFilterMatch = await uniqueFilterService.matchModelByAttributes({
  termType: "filter_model",
  attributes: {
    dimension: ["L1(125mm)，L2（835mm），L3（220mm）"],
    weight: ["305kg"],
    filter_diameter: ["Φ100mm"],
    effective_filter_area: ["2×78CM2"],
  },
});
assert.equal(uniqueFilterMatch.reason, "matched");
assert.equal(uniqueFilterMatch.masterDataMatch.matched, true);
assert.equal(uniqueFilterMatch.masterDataMatch.model, "GD-DP-A-120");
assert.equal(uniqueFilterMatch.masterDataMatch.matchMethod, "attributes_unique_exact");

const duplicateFilterService = new ProductConfigAgentMasterDataService(
  createDataSource(
    new Map<any, any[]>([
      [
        Filter,
        [
          { id: 1, model: "A", dimension: "100mm", weight: "10kg" },
          { id: 2, model: "B", dimension: "100mm", weight: "10kg" },
        ],
      ],
    ]),
  ),
);
const duplicateFilterMatch = await duplicateFilterService.matchModelByAttributes({
  termType: "filter_model",
  attributes: {
    dimension: ["100mm"],
    weight: ["10kg"],
  },
});
assert.equal(duplicateFilterMatch.reason, "multiple_matches");
assert.equal(duplicateFilterMatch.masterDataMatch.matched, false);
assert.equal(duplicateFilterMatch.candidateCount, 2);

const insufficientFilterMatch = await uniqueFilterService.matchModelByAttributes({
  termType: "filter_model",
  attributes: {
    dimension: ["L1(125mm)，L2（835mm），L3（220mm）"],
  },
});
assert.equal(insufficientFilterMatch.reason, "insufficient_attributes");
assert.equal(insufficientFilterMatch.masterDataMatch.matched, false);

const uniquePumpService = new ProductConfigAgentMasterDataService(
  createDataSource(
    new Map<any, any[]>([
      [
        Pump,
        [
          {
            id: 10,
            model: "10ccm",
            pumpage: "10ccm",
            rotateSpeed: "10rpm",
            heatingPower: "1KW",
            production: "200kg/h",
          },
          {
            id: 11,
            model: "20ccm",
            pumpage: "20ccm",
            rotateSpeed: "20rpm",
            heatingPower: "2KW",
            production: "400kg/h",
          },
        ],
      ],
    ]),
  ),
);
const uniquePumpMatch = await uniquePumpService.matchModelByAttributes({
  termType: "metering_pump_model",
  attributes: {
    pump_displacement: ["10ccm"],
    rotation_speed: ["10rpm"],
  },
});
assert.equal(uniquePumpMatch.reason, "matched");
assert.equal(uniquePumpMatch.masterDataMatch.model, "10ccm");

console.log("productConfigAgent master data service tests passed");
