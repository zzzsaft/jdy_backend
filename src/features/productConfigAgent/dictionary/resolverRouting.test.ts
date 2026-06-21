import assert from "node:assert/strict";
import {
  AUTO_ACCEPT_PENDING_THRESHOLD,
  ResolverRoutingService,
} from "./resolverRouting.service.js";
import type { ConceptIssue, ConceptMatchTarget } from "./conceptResolver.types.js";

const routing = new ResolverRoutingService();

function target(score: number): ConceptMatchTarget {
  return {
    targetType: "term",
    id: "1",
    termType: "plastic_material",
    canonicalValue: "PVC",
    displayName: "PVC",
    relationType: "exact_alias",
    score,
  };
}

function route(overrides: Partial<Parameters<ResolverRoutingService["route"]>[0]> = {}) {
  return routing.route({
    candidateType: "value",
    topTarget: target(0.95),
    topIssue: null,
    occurrenceCount: 2,
    aliasExact: true,
    issues: [],
    negative: {},
    valueKind: "enum",
    unifiedScore: AUTO_ACCEPT_PENDING_THRESHOLD,
    hardConstraints: [],
    config: { llmEnabled: true },
    ...overrides,
  });
}

function testThresholdsBelongToRoutingLayer() {
  const synonymTarget: ConceptMatchTarget = {
    ...target(0.8),
    relationType: "synonym_alias",
  };
  assert.equal(
    route({
      topTarget: synonymTarget,
      aliasExact: false,
      unifiedScore: 0.8,
    }).route,
    "llm_review",
  );
  assert.equal(
    route({
      topTarget: synonymTarget,
      aliasExact: false,
      unifiedScore: 0.8,
      config: { llmEnabled: true, thresholds: { autoAcceptPending: 0.75 } },
    }).route,
    "auto_accept_pending",
  );
}

function testHardConstraintOverridesHighScore() {
  assert.equal(
    route({
      unifiedScore: 0.99,
      hardConstraints: [
        {
          id: "test.blocks_auto_accept",
          blocksAutoAccept: true,
          reason: "blocked",
        },
      ],
    }).route,
    "human_review",
  );
}

function testTrustTierIsNotRoutingInput() {
  assert.equal(
    route({
      unifiedScore: 0.99,
      hardConstraints: [
        {
          id: "trusted_label_is_irrelevant",
          blocksAutoAccept: true,
          reason: "constraint wins over labels",
          evidence: { trustTier: "trusted" },
        },
      ],
    }).route,
    "human_review",
  );
}

function testTermTypeAutoAcceptBlocked() {
  assert.equal(
    route({
      candidateType: "term_type",
      unifiedScore: 0.99,
      topTarget: null,
    }).route,
    "human_review",
  );
}

function testTermTypeExactAliasAutoPasses() {
  const result = route({
    candidateType: "term_type",
    topTarget: {
      targetType: "term_type",
      id: "1",
      termType: "heating_zone_count",
      displayName: "加热分区数量",
      relationType: "exact_alias",
      score: 0.98,
    },
    aliasExact: true,
    unifiedScore: 0.98,
  });
  assert.equal(result.route, "auto_pass");
  assert.equal(result.recommendedAction, "map_to_existing_termtype");
}

function testLowEvidenceDefersBeforeScoreRouting() {
  assert.equal(
    route({
      occurrenceCount: 1,
      aliasExact: false,
      unifiedScore: 0.99,
    }).route,
    "defer_until_more_occurrences",
  );
}

function qualifierIssue(overrides: Partial<ConceptIssue> = {}): ConceptIssue {
  return {
    detector: "QualifierVariantDetector",
    relationType: "qualifier_variant" as const,
    recommendedAction: "map_as_qualifier_variant" as const,
    confidence: 0.95,
    riskLevel: "medium" as const,
    reason: "qualifier variant",
    blocksAutoApply: true,
    ...overrides,
  };
}

function testUnstructuredQualifierVariantRequiresHumanReview() {
  const issue = qualifierIssue();
  const result = route({
    topIssue: issue,
    issues: [issue],
    unifiedScore: 0.99,
  });
  assert.equal(result.route, "human_review");
  assert.equal(result.recommendedAction, "map_as_qualifier_variant");
}

function testStructuredQualifierVariantAutoPasses() {
  const issue = qualifierIssue({
    confidence: 0.68,
    riskLevel: "low",
    evidence: { structured: true, matchedQualifierAlias: "上模" },
  });
  const result = route({
    topIssue: issue,
    issues: [issue],
    unifiedScore: 0.68,
  });
  assert.equal(result.route, "auto_pass");
  assert.equal(result.recommendedAction, "map_as_qualifier_variant");
}

function testMaterialValueAutoPassesWhenLowRisk() {
  const result = route({
    termType: "plastic_material",
    topTarget: {
      ...target(0.78),
      relationType: "split_component",
    },
    aliasExact: false,
    unifiedScore: 0.67,
    hardConstraints: [
      {
        id: "relation_hard_constraints.blocks_auto_accept",
        blocksAutoAccept: true,
        reason: "split component usually requires review",
      },
    ],
  });
  assert.equal(result.route, "auto_pass");
  assert.equal(result.recommendedAction, "split_value");
}

function testMaterialValueAutoPassesBeforeLowOccurrenceDefer() {
  const result = route({
    termType: "application",
    topTarget: null,
    occurrenceCount: 1,
    aliasExact: false,
    unifiedScore: 0.45,
  });
  assert.equal(result.route, "auto_pass");
  assert.equal(result.recommendedAction, "create_new_enum_value_candidate");
}

function testValueExactAliasAutoAcceptsWhenLowRisk() {
  const result = route({
    termType: "deckle_type",
    topTarget: target(0.78),
    aliasExact: true,
    unifiedScore: 0.78,
  });
  assert.equal(result.route, "auto_accept_pending");
  assert.equal(result.recommendedAction, "add_alias");
}

function testMaterialValueHighRiskStillRequiresReview() {
  const issue = {
    detector: "CrossTermTypeValueDetector",
    relationType: "different_concept" as const,
    recommendedAction: "send_to_review" as const,
    confidence: 0.83,
    riskLevel: "high" as const,
    reason: "cross term",
    blocksAutoApply: true,
  };
  const result = route({
    termType: "application",
    topIssue: issue,
    issues: [issue],
    unifiedScore: 0.83,
  });
  assert.equal(result.route, "human_review");
  assert.equal(result.recommendedAction, "send_to_review");
}

testThresholdsBelongToRoutingLayer();
testHardConstraintOverridesHighScore();
testTrustTierIsNotRoutingInput();
testTermTypeAutoAcceptBlocked();
testTermTypeExactAliasAutoPasses();
testLowEvidenceDefersBeforeScoreRouting();
testUnstructuredQualifierVariantRequiresHumanReview();
testStructuredQualifierVariantAutoPasses();
testMaterialValueAutoPassesWhenLowRisk();
testMaterialValueAutoPassesBeforeLowOccurrenceDefer();
testValueExactAliasAutoAcceptsWhenLowRisk();
testMaterialValueHighRiskStillRequiresReview();

console.log("resolver routing tests passed");
