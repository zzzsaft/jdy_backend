import type {
  ConceptRecommendedAction,
  ConceptRelationType,
  ConceptRuleSignal,
} from "./conceptResolver.types.js";

type RuleDefinition = {
  ruleId: string;
  relationType?: ConceptRelationType;
  recommendedAction?: ConceptRecommendedAction;
  riskLevel: "low" | "medium" | "high";
  description: string;
};

const RULES: RuleDefinition[] = [
  {
    ruleId: "document_info_move",
    relationType: "wrong_scope",
    recommendedAction: "move_scope",
    riskLevel: "medium",
    description: "Document-level fields were moved out of product item fields.",
  },
  {
    ruleId: "product_type_redirect",
    relationType: "wrong_scope",
    recommendedAction: "move_scope",
    riskLevel: "medium",
    description: "A field points to a different product item in the same extraction.",
  },
  {
    ruleId: "structured_field_label",
    relationType: "qualifier_variant",
    recommendedAction: "map_as_qualifier_variant",
    riskLevel: "medium",
    description: "Structured labels preserve qualifier context on a field.",
  },
  {
    ruleId: "structured_qualifier_normalized",
    relationType: "qualifier_variant",
    recommendedAction: "map_as_qualifier_variant",
    riskLevel: "low",
    description: "Qualifier text was moved from the field name into structured qualifier metadata.",
  },
  {
    ruleId: "range_bound_merge",
    relationType: "qualifier_variant",
    recommendedAction: "map_as_qualifier_variant",
    riskLevel: "medium",
    description: "Min/max variants merge into one range field.",
  },
  {
    ruleId: "number_unit_part_merge",
    relationType: "split_component",
    recommendedAction: "send_to_review",
    riskLevel: "medium",
    description: "Number and unit parts merge into one number-unit field.",
  },
  {
    ruleId: "indexed_instance_normalized",
    relationType: "extraction_error",
    recommendedAction: "mark_extraction_error",
    riskLevel: "low",
    description: "Trailing field digits are treated as item instance indexes.",
  },
  {
    ruleId: "selection_split",
    relationType: "split_component",
    recommendedAction: "split_value",
    riskLevel: "medium",
    description: "LLM split_fields were normalized into selected option fields.",
  },
  {
    ruleId: "contextual_lip_gap_rewrite",
    relationType: "qualifier_variant",
    recommendedAction: "map_as_qualifier_variant",
    riskLevel: "medium",
    description: "Flat-die lip gap text was rewritten with qualifier context.",
  },
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.ruleId, rule]));

export class NormalizationRuleRegistry {
  static listRules(): RuleDefinition[] {
    return RULES;
  }

  static signal(
    ruleId: string,
    params?: Omit<ConceptRuleSignal, "ruleId" | "relationType" | "recommendedAction">,
  ): ConceptRuleSignal {
    const rule = RULE_BY_ID.get(ruleId);
    return {
      ruleId,
      relationType: rule?.relationType,
      recommendedAction: rule?.recommendedAction,
      confidence: params?.confidence,
      message: params?.message ?? rule?.description,
      before: params?.before,
      after: params?.after,
      evidence: params?.evidence,
    };
  }

  static mergeSignalsIntoEvidence(
    evidence: unknown,
    signals: ConceptRuleSignal[],
  ): unknown {
    if (signals.length === 0) {
      return evidence;
    }
    const base =
      evidence && typeof evidence === "object" && !Array.isArray(evidence)
        ? { ...(evidence as Record<string, unknown>) }
        : evidence === undefined || evidence === null
          ? {}
          : { sourceEvidence: evidence };
    const existing = Array.isArray((base as any).ruleSignals)
      ? ((base as any).ruleSignals as unknown[])
      : [];
    return {
      ...base,
      ruleSignals: [...existing, ...signals],
    };
  }

  static extractSignals(evidence: unknown): ConceptRuleSignal[] {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      return [];
    }
    const signals = (evidence as any).ruleSignals;
    if (!Array.isArray(signals)) {
      return [];
    }
    const result: ConceptRuleSignal[] = [];
    for (const signal of signals) {
      if (!signal || typeof signal !== "object") {
        continue;
      }
      const ruleId = String((signal as any).ruleId ?? "").trim();
      if (!ruleId) {
        continue;
      }
      result.push({
        ruleId,
        relationType: (signal as any).relationType,
        recommendedAction: (signal as any).recommendedAction,
        confidence:
          (signal as any).confidence === undefined
            ? undefined
            : Number((signal as any).confidence),
        message:
          (signal as any).message === undefined
            ? undefined
            : String((signal as any).message),
        before: (signal as any).before,
        after: (signal as any).after,
        evidence: (signal as any).evidence,
      });
    }
    return result;
  }
}
