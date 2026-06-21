import assert from "node:assert/strict";
import { getMetadataArgsStorage } from "typeorm";
import { DictionaryHealthAuditService } from "./dictionaryHealthAudit.service.js";
import { DictionaryHealthReport } from "./entity/index.js";

const service = new DictionaryHealthAuditService({} as any);

function termType(overrides: Record<string, unknown> = {}) {
  return {
    id: "101",
    termType: "plastic_material",
    displayName: "塑料原料",
    valueKind: "enum",
    scope: "item",
    applicableProductTypes: ["flat_die"],
    isActive: true,
    ...overrides,
  } as any;
}

function term(overrides: Record<string, unknown> = {}) {
  return {
    id: "201",
    termType: "plastic_material",
    canonicalValue: "PVC",
    displayName: "PVC",
    scope: "value",
    isActive: true,
    ...overrides,
  } as any;
}

function alias(overrides: Record<string, unknown> = {}) {
  return {
    id: "301",
    termId: "201",
    termType: "plastic_material",
    aliasValue: "PVC",
    normalizedAlias: "pvc",
    confidence: "1.000",
    isActive: true,
    ...overrides,
  } as any;
}

function testCleanEntryIsLowRisk() {
  const [report] = service.buildReports({
    termTypes: [termType()],
    terms: [term()],
    aliases: [alias()],
    archivedFields: [
      {
        termType: "plastic_material",
        canonicalValue: "PVC",
        rawValue: "PVC",
        sourceProductType: "flat_die",
        valueKind: "enum",
        numberUnit: null,
      },
    ],
    valueCandidatePressure: new Map(),
    termTypeCandidatePressure: new Map(),
  } as any, {
    targetKind: "termType",
    auditRunId: "audit-test",
    dictionaryVersion: "3",
  });

  assert.equal(report.targetKind, "termType");
  assert.equal(report.auditRunId, "audit-test");
  assert.equal(report.dictionaryVersion, "3");
  assert.ok(report.riskScore < 20);
  assert.equal(Object.hasOwn(report, "trustTier"), false);
  assert.equal(Object.hasOwn(report.trustSignals, "trustTier"), false);
}

function testAliasCollisionAndCompositePressure() {
  const reports = service.buildReports({
    termTypes: [termType(), termType({ termType: "color", displayName: "颜色" })],
    terms: [term(), term({ id: "202", termType: "color", canonicalValue: "PVC" })],
    aliases: [
      alias(),
      alias({
        id: "302",
        termId: "202",
        termType: "color",
        aliasValue: "PVC",
        normalizedAlias: "pvc",
      }),
    ],
    archivedFields: [
      {
        termType: "plastic_material",
        canonicalValue: "PVC",
        rawValue: "PVC/ABS",
        sourceProductType: "hydraulic_station",
        valueKind: "enum",
        numberUnit: null,
      },
    ],
    valueCandidatePressure: new Map([
      [
        "201",
        {
          pendingCount: 3,
          reviewedCount: 0,
          rejectedCount: 0,
          resolverHighRiskCount: 1,
          sampleRawValues: ["PVC/ABS"],
          productTypes: ["hydraulic_station"],
        },
      ],
    ]),
    termTypeCandidatePressure: new Map(),
  } as any, { targetKind: "enumValue" });

  const report = reports.find((item) => item.targetId === "201");
  assert.ok(report);
  assert.equal(report?.riskLabels.includes("alias_purity"), true);
  assert.equal(report?.riskLabels.includes("composite_value_rate"), true);
  assert.equal(report?.riskLabels.includes("candidate_mapping_pressure"), true);
  assert.ok((report?.riskScore ?? 0) >= 15);
}

function testSlashUnitWhitelistForCompositePressure() {
  const reports = service.buildReports({
    termTypes: [
      termType({
        termType: "capacity",
        displayName: "产能",
        valueKind: "number_unit",
        applicableProductTypes: ["flat_die"],
      }),
      termType({
        termType: "surface_treatment",
        displayName: "表面处理",
        valueKind: "enum",
        applicableProductTypes: ["flat_die"],
      }),
    ],
    terms: [
      term({
        id: "401",
        termType: "capacity",
        canonicalValue: "10kg/h",
      }),
      term({
        id: "402",
        termType: "surface_treatment",
        canonicalValue: "导电/防静电",
      }),
    ],
    aliases: [],
    archivedFields: [
      {
        termType: "capacity",
        canonicalValue: "10kg/h",
        rawValue: "10 kg/h",
        sourceProductType: "flat_die",
        valueKind: "number_unit",
        numberUnit: null,
      },
      {
        termType: "capacity",
        canonicalValue: "20ml/min",
        rawValue: "20 ml/min",
        sourceProductType: "flat_die",
        valueKind: "number_unit",
        numberUnit: null,
      },
    ],
    valueCandidatePressure: new Map(),
    termTypeCandidatePressure: new Map(),
  } as any, { targetKind: "termType" });

  const capacityReport = reports.find((item) => item.targetId === "capacity");
  assert.ok(capacityReport);
  assert.equal(
    capacityReport?.riskLabels.includes("composite_value_rate"),
    false,
  );

  const enumReports = service.buildReports({
    termTypes: [
      termType({
        termType: "surface_treatment",
        displayName: "表面处理",
        valueKind: "enum",
        applicableProductTypes: ["flat_die"],
      }),
    ],
    terms: [
      term({
        id: "501",
        termType: "surface_treatment",
        canonicalValue: "导电/防静电",
      }),
    ],
    aliases: [],
    archivedFields: [],
    valueCandidatePressure: new Map(),
    termTypeCandidatePressure: new Map(),
  } as any, { targetKind: "enumValue" });
  const surfaceReport = enumReports.find((item) => item.targetId === "501");
  assert.ok(surfaceReport);
  assert.equal(
    surfaceReport?.riskLabels.includes("composite_value_rate"),
    true,
  );
}

function testLayerQualifierRisk() {
  const reports = service.buildReports({
    termTypes: [
      termType({
        termType: "layer_ratio",
        displayName: "A层比例",
        valueKind: "text",
        applicableProductTypes: ["feedblock"],
      }),
    ],
    terms: [],
    aliases: [],
    archivedFields: [],
    valueCandidatePressure: new Map(),
    termTypeCandidatePressure: new Map(),
  } as any, { targetKind: "termType" });

  const report = reports.find((item) => item.targetId === "layer_ratio");
  assert.ok(report);
  assert.equal(report?.riskLabels.includes("qualifier_risk"), true);
}

function testEntityTargetsProductConfigAgentSchema() {
  const metadataArgs = getMetadataArgsStorage().tables.find(
    (table) => table.target === DictionaryHealthReport,
  );
  assert.equal(metadataArgs?.name, "dictionary_health_report");
  assert.equal(metadataArgs?.schema, "productConfigAgent");
  const instance = new DictionaryHealthReport();
  assert.equal(Object.hasOwn(instance, "trustTier"), false);
}

testCleanEntryIsLowRisk();
testAliasCollisionAndCompositePressure();
testSlashUnitWhitelistForCompositePressure();
testLayerQualifierRisk();
testEntityTargetsProductConfigAgentSchema();

console.log("dictionary health audit tests passed");
