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

function testCompositeValueDetectorSkipsSplitEvidence() {
  const issues = detector.detect({
    candidateType: "value",
    termType: "plastic_material",
    rawValue: "POE",
    sourceRawValue: "EVA、POE太阳能背膜",
    splitFromRawValue: "POE",
    normalizedRawValue: "poe",
    valueKind: "enums",
  });
  assert.equal(
    issues.some((issue) => issue.detector === "CompositeValueDetector"),
    false,
  );
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

function testPlaceholderValueNoiseDetector() {
  const issues = detector.detect({
    candidateType: "value",
    termType: "connection_drawing_status",
    rawValue: "未选中",
    normalizedRawValue: "未选中",
    valueKind: "enum",
  });
  assert.equal(issues[0]?.detector, "PlaceholderValueNoiseDetector");
  assert.equal(issues[0]?.relationType, "non_config_noise");
  assert.equal(issues[0]?.recommendedAction, "mark_non_config");
}

function testDocumentPersonnelScopeDetector() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "下生产单人员",
    normalizedFieldName: "下生产单人员",
    rawValue: "蔡金枝",
    scope: "item",
  });
  assert.equal(issues[0]?.detector, "ScopeContaminationDetector");
  assert.equal(issues[0]?.relationType, "wrong_scope");
  assert.equal(issues[0]?.recommendedAction, "move_scope");
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

function testQualifierVariantDetectorSuggestsBaseField() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "上模是否有阻流棒",
    normalizedFieldName: "上模是否有阻流棒",
    rawValue: "有",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal(issues[0]?.relationType, "qualifier_variant");
  assert.equal(issues[0]?.recommendedAction, "map_as_qualifier_variant");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "是否有阻流棒");
  assert.equal((issues[0]?.evidence as any).qualifier.position, "upper_die");
}

function testQualifierVariantDetectorHandlesPumpPressure() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "泵后压力",
    normalizedFieldName: "泵后压力",
    rawValue: "20MPa",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "压力");
  assert.equal((issues[0]?.evidence as any).qualifier.position, "post_pump");
}

function testQualifierVariantDetectorHandlesCInletInsertBlock() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "C入口镶块材质",
    normalizedFieldName: "C入口镶块材质",
    rawValue: "H13",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "镶块材质");
  assert.equal((issues[0]?.evidence as any).qualifier.position, "c_inlet");
  assert.equal((issues[0]?.evidence as any).qualifier.area, "insert_block");
}

function testQualifierVariantDetectorHandlesLayer() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "A层比例",
    normalizedFieldName: "A层比例",
    rawValue: "15%",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "层比例");
  assert.equal((issues[0]?.evidence as any).qualifier.layer, "A");
}

function testQualifierVariantDetectorHandlesLipInstance() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "第二套模唇厚度",
    normalizedFieldName: "第二套模唇厚度",
    rawValue: "8mm",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "模唇厚度");
  assert.equal((issues[0]?.evidence as any).qualifier.area, "lip");
  assert.equal((issues[0]?.evidence as any).qualifier.instanceIndex, 2);
}

function testStructuredQualifierTriggersQualifierVariant() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "压力",
    normalizedFieldName: "压力",
    rawValue: "20MPa",
    qualifier: { position: "post_pump", sourceText: "泵后" },
    baseFieldName: "压力",
    originalFieldName: "泵后压力",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal(issues[0]?.relationType, "qualifier_variant");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "压力");
  assert.equal((issues[0]?.evidence as any).qualifier.position, "post_pump");
}

function testStructuredLayerQualifierTriggersQualifierVariant() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "层比例",
    normalizedFieldName: "层比例",
    rawValue: "15%",
    qualifier: { layer: "A", sourceText: "A层" },
    baseFieldName: "层比例",
    originalFieldName: "A层比例",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal(issues[0]?.relationType, "qualifier_variant");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "层比例");
  assert.equal((issues[0]?.evidence as any).qualifier.layer, "A");
}

function testStructuredLipInstanceQualifierTriggersQualifierVariant() {
  const issues = detector.detect({
    candidateType: "term_type",
    rawFieldName: "模唇厚度",
    normalizedFieldName: "模唇厚度",
    rawValue: "8mm",
    qualifier: { area: "lip", instanceIndex: 2, sourceText: "第二套" },
    baseFieldName: "模唇厚度",
    originalFieldName: "第二套模唇厚度",
  });
  assert.equal(issues[0]?.detector, "QualifierVariantDetector");
  assert.equal(issues[0]?.relationType, "qualifier_variant");
  assert.equal((issues[0]?.evidence as any).baseFieldName, "模唇厚度");
  assert.equal((issues[0]?.evidence as any).qualifier.area, "lip");
  assert.equal((issues[0]?.evidence as any).qualifier.instanceIndex, 2);
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
testCompositeValueDetectorSkipsSplitEvidence();
testScopeContaminationDetector();
testPlaceholderValueNoiseDetector();
testDocumentPersonnelScopeDetector();
testValueAsTypeDetector();
testCrossTermTypeDetector();
testQualifierVariantDetectorSuggestsBaseField();
testQualifierVariantDetectorHandlesPumpPressure();
testQualifierVariantDetectorHandlesCInletInsertBlock();
testQualifierVariantDetectorHandlesLayer();
testQualifierVariantDetectorHandlesLipInstance();
testStructuredQualifierTriggersQualifierVariant();
testStructuredLayerQualifierTriggersQualifierVariant();
testStructuredLipInstanceQualifierTriggersQualifierVariant();
testRuleSignalRoundTrip();

console.log("concept issue detector tests passed");
