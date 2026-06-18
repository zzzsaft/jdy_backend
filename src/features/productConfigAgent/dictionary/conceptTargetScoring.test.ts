import assert from "node:assert/strict";
import {
  AUTO_ACCEPT_PENDING_THRESHOLD,
  ConceptTargetScoringService,
} from "./conceptTargetScoring.service.js";
import { ConceptResolverService } from "./conceptResolver.service.js";
import type { ConceptMatchTarget } from "./conceptResolver.types.js";

const scorer = new ConceptTargetScoringService();

function exactAliasTarget(
  baselineTrustTier: ConceptMatchTarget["baselineTrustTier"],
): ConceptMatchTarget {
  return {
    targetType: "term",
    id: "1",
    termType: "plastic_material",
    canonicalValue: "PVC",
    displayName: "PVC",
    relationType: "exact_alias",
    score: 0.95,
    baselineTrustTier,
    targetRiskLabels: [],
  };
}

function policyEvaluation(target: ConceptMatchTarget) {
  return (target.scoreBreakdown as any)?.policyEvaluation;
}

function routeFor(target: ConceptMatchTarget) {
  const resolver = new ConceptResolverService({} as any) as any;
  return resolver.scoreAndRoute({
    loaded: {
      candidateType: "value",
      candidate: { id: "10", termType: "plastic_material" },
    },
    targets: [target],
    issues: [],
    occurrenceCount: 2,
    positive: { aliasExact: true },
    negative: {},
    valueKind: "enum",
  });
}

function testCleanExactAliasAutoAcceptPendingByScore() {
  const target = scorer.scoreTarget({
    target: exactAliasTarget("trusted"),
    positive: { aliasExact: true },
    negative: {},
    issues: [],
  });
  assert.ok((target.contextAwareScore ?? 0) >= AUTO_ACCEPT_PENDING_THRESHOLD);
  assert.equal(typeof policyEvaluation(target).scoringVector.trustScore, "number");
  assert.equal(typeof policyEvaluation(target).scoringVector.riskScore, "number");
  assert.equal(typeof policyEvaluation(target).scoringVector.contextScore, "number");
  assert.equal(typeof policyEvaluation(target).scoringVector.constraintScore, "number");
  assert.equal(policyEvaluation(target).unifiedScore, target.contextAwareScore);
  assert.equal(policyEvaluation(target).policyVersion, "dictionary_policy_v1");
  assert.equal(Object.hasOwn(policyEvaluation(target), "routeRecommendation"), false);
  assert.equal(policyEvaluation(target).intermediateLabels.trustTier, "trusted");
  assert.equal(target.targetTrustTier, undefined);
  assert.equal(routeFor(target).route, "auto_accept_pending");
}

function testTrustedLabelDoesNotOverrideHardConstraint() {
  const target = scorer.scoreTarget({
    target: exactAliasTarget("trusted"),
    positive: { aliasExact: true },
    negative: { valueKindConflict: true },
    issues: [],
  });
  assert.notEqual(policyEvaluation(target).intermediateLabels.trustTier, "trusted");
  assert.equal(
    policyEvaluation(target).hardConstraints.some(
      (constraint: any) => constraint.blocksAutoAccept === true,
    ),
    true,
  );
  assert.equal(routeFor(target).route, "human_review");
}

function testRoutingUsesVectorAndConstraintsNotTrustTierDirectly() {
  const highScore = scorer.scoreTarget({
    target: exactAliasTarget("trusted"),
    positive: { aliasExact: true },
    negative: {},
    issues: [],
  });
  const blocked = scorer.scoreTarget({
    target: exactAliasTarget("trusted"),
    positive: { aliasExact: true },
    negative: {},
    issues: [
      {
        detector: "CompositeValueDetector",
        relationType: "composite_value",
        recommendedAction: "split_value",
        confidence: 0.86,
        riskLevel: "low",
        reason: "复合值需要拆分",
        blocksAutoApply: true,
      },
    ],
  });
  assert.equal(typeof policyEvaluation(blocked).intermediateLabels.trustTier, "string");
  assert.ok(policyEvaluation(highScore).scoringVector.constraintScore > policyEvaluation(blocked).scoringVector.constraintScore);
  assert.equal(routeFor(highScore).route, "auto_accept_pending");
  assert.equal(routeFor(blocked).route, "human_review");
}

function testNoHealthReportIsAbsentNotTrusted() {
  const target = scorer.scoreTarget({
    target: exactAliasTarget("provisional"),
    positive: {},
    negative: {},
    issues: [],
  });
  assert.equal(policyEvaluation(target).intermediateLabels.auditTrustTier, undefined);
  assert.equal(policyEvaluation(target).evidence.audit_risk_signal, undefined);
  assert.equal(policyEvaluation(target).auditRunId, null);
  assert.equal(policyEvaluation(target).dictionaryVersion, null);
}

function testAuditProvenanceIsCarriedIntoPolicyEvaluation() {
  const target = scorer.scoreTarget({
    target: {
      ...exactAliasTarget("trusted"),
      evidence: {
        auditSignal: {
          riskScore: 10,
          riskLabels: [],
          trustSignals: {},
          evidenceJson: {},
          auditRunId: "job-1",
          dictionaryVersion: "7",
        },
      },
    },
    positive: { aliasExact: true },
    negative: {},
    issues: [],
  });
  assert.equal(policyEvaluation(target).auditRunId, "job-1");
  assert.equal(policyEvaluation(target).dictionaryVersion, "7");
}

testCleanExactAliasAutoAcceptPendingByScore();
testTrustedLabelDoesNotOverrideHardConstraint();
testRoutingUsesVectorAndConstraintsNotTrustTierDirectly();
testNoHealthReportIsAbsentNotTrusted();
testAuditProvenanceIsCarriedIntoPolicyEvaluation();

console.log("concept target policy scoring tests passed");
