import assert from "node:assert/strict";
import {
  AUTO_ACCEPT_PENDING_THRESHOLD,
  ResolverRoutingService,
} from "./resolverRouting.service.js";
import type { ConceptMatchTarget } from "./conceptResolver.types.js";

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
  assert.equal(route({ unifiedScore: 0.8 }).route, "llm_review");
  assert.equal(
    route({
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
    }).route,
    "human_review",
  );
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

testThresholdsBelongToRoutingLayer();
testHardConstraintOverridesHighScore();
testTrustTierIsNotRoutingInput();
testTermTypeAutoAcceptBlocked();
testLowEvidenceDefersBeforeScoreRouting();

console.log("resolver routing tests passed");
