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
testEntityTargetsProductConfigAgentSchema();

console.log("dictionary health audit tests passed");
