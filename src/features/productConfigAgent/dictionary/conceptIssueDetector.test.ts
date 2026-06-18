import assert from "node:assert/strict";
import { ConceptIssueDetectorService } from "./conceptIssueDetector.service.js";
import { NormalizationRuleRegistry } from "./normalizationRuleRegistry.js";

const detector = new ConceptIssueDetectorService();

function testCompositeValueDetector() {
  const issues = detector.detect({
    candidateType: "value",
    termType: "plastic_material",
    rawValue: "PVC / 自由发泡板",
    normalizedRawValue: "pvc自由发泡板",
    valueKind: "enum",
  });
  assert.equal(issues[0]?.detector, "CompositeValueDetector");
  assert.equal(issues[0]?.relationType, "composite_value");
  assert.equal(issues[0]?.recommendedAction, "split_value");
  assert.equal(issues[0]?.blocksAutoApply, true);
}

function testCompositeValueDetectorUsesSourceRawValue() {
  const issues = detector.detect({
    candidateType: "value",
    termType: "plastic_material",
    rawValue: "POE太阳能背膜",
    sourceRawValue: "EVA、POE太阳能背膜",
    normalizedRawValue: "poe太阳能背膜",
    valueKind: "enums",
  });
  assert.equal(issues[0]?.detector, "CompositeValueDetector");
  assert.equal(issues[0]?.relationType, "composite_value");
  assert.equal(issues[0]?.recommendedAction, "split_value");
}

function testScopeContaminationDetector() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "客户交货日期",
    normalizedFieldName: "客户交货日期",
    rawValue: "2026-06-17",
    scope: "item",
  });
  assert.equal(issues[0]?.detector, "ScopeContaminationDetector");
  assert.equal(issues[0]?.relationType, "wrong_scope");
  assert.equal(issues[0]?.recommendedAction, "move_scope");
  assert.equal(issues[0]?.riskLevel, "high");
}

function testValueAsTypeDetector() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "PVC",
    normalizedFieldName: "pvc",
    knownValueAliasTermTypes: ["plastic_material"],
  });
  assert.equal(issues[0]?.detector, "ValueAsTypeDetector");
  assert.equal(issues[0]?.relationType, "value_as_type");
}

function testCrossTermTypeDetector() {
  const issues = detector.detect({
    candidateType: "value",
    termType: "surface_treatment",
    rawValue: "PVC",
    normalizedRawValue: "pvc",
    knownValueAliasTermTypes: ["plastic_material"],
  });
  assert.equal(issues[0]?.detector, "CrossTermTypeValueDetector");
  assert.equal(issues[0]?.relationType, "different_concept");
}

function testRuleSignalRoundTrip() {
  const signal = NormalizationRuleRegistry.signal("indexed_instance_normalized", {
    confidence: 0.9,
    evidence: { baseFieldName: "模唇厚度", instanceIndex: 2 },
  });
  const evidence = NormalizationRuleRegistry.mergeSignalsIntoEvidence(
    { source: "unit-test" },
    [signal],
  );
  const signals = NormalizationRuleRegistry.extractSignals(evidence);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].ruleId, "indexed_instance_normalized");
  assert.equal(signals[0].relationType, "extraction_error");
  assert.equal(signals[0].recommendedAction, "mark_extraction_error");
}

testCompositeValueDetector();
testCompositeValueDetectorUsesSourceRawValue();
testScopeContaminationDetector();
testValueAsTypeDetector();
testCrossTermTypeDetector();
testRuleSignalRoundTrip();

console.log("concept issue detector tests passed");
