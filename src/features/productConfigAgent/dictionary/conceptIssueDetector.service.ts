import type {
  ConceptIssue,
  ConceptRuleSignal,
  DictionaryConceptScope,
} from "./conceptResolver.types.js";
import { normalizeText } from "./dictionary.utils.js";

type DetectionInput = {
  candidateType: "term_type" | "value";
  rawFieldName?: string | null;
  normalizedFieldName?: string | null;
  termType?: string | null;
  rawValue?: string | null;
  sourceRawValue?: string | null;
  normalizedRawValue?: string | null;
  sourceProductType?: string | null;
  valueKind?: string | null;
  scope?: DictionaryConceptScope | string | null;
  ruleSignals?: ConceptRuleSignal[];
  knownValueAliasTermTypes?: string[];
  occurrenceCount?: number;
  documentCount?: number;
};

type Detector = {
  name: string;
  detect(input: DetectionInput): ConceptIssue | null;
};

const QUALIFIER_PATTERN =
  /(上限|下限|最大|最小|前段|后段|内侧|外侧|入口|出口|上模|下模|第一|第二|第三|第[一二三四五六七八九十0-9]+套|左侧|右侧)/u;
const COMPOSITE_PATTERN = /[+＋、，,\/／|]|(?:及|和|与|或|;|；)/u;
const UNIT_PATTERN = /\d+(?:\.\d+)?\s*(mm|毫米|cm|m|kg|g|mpa|bar|kw|w|v|ccm|rpm|℃|度)/iu;
const NON_CONFIG_PATTERN = /^(备注|说明|序号|编号|客户|合同|订单|日期|签字|审核|制表)$/u;
const DOC_SCOPE_PATTERN = /(合同|订单|客户|国家|日期|交期|交货|地址|联系人|电话)/u;
const MULTI_ITEM_PATTERN = /(第[一二三四五六七八九十0-9]+套|[0-9]+#|[一二三四五六七八九十0-9]+号|多套|多台)/u;

class ValueAsTypeDetector implements Detector {
  name = "ValueAsTypeDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    if (input.candidateType !== "term_type") return null;
    const normalized = input.normalizedFieldName || normalizeText(input.rawFieldName);
    if (!normalized) return null;
    const knownTermTypes = input.knownValueAliasTermTypes ?? [];
    if (knownTermTypes.length === 0) return null;
    return {
      detector: this.name,
      relationType: "value_as_type",
      recommendedAction: "send_to_review",
      confidence: 0.86,
      riskLevel: "medium",
      reason: "字段名命中了已有枚举值 alias，可能是把 value 当成了字段 Key",
      evidence: { normalizedFieldName: normalized, matchedTermTypes: knownTermTypes },
      blocksAutoApply: true,
    };
  }
}

class QualifierVariantDetector implements Detector {
  name = "QualifierVariantDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    const text = `${input.rawFieldName ?? ""} ${input.rawValue ?? ""}`;
    if (!QUALIFIER_PATTERN.test(text)) return null;
    return {
      detector: this.name,
      relationType: "qualifier_variant",
      recommendedAction: "map_as_qualifier_variant",
      confidence: 0.74,
      riskLevel: "medium",
      reason: "候选包含部位、范围或序号等限定词，可能是已有概念的 qualifier 变体",
      evidence: { text },
      blocksAutoApply: true,
    };
  }
}

class CompositeValueDetector implements Detector {
  name = "CompositeValueDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    if (input.candidateType !== "value") return null;
    const rawValue = String(input.rawValue ?? "").trim();
    const sourceRawValue = String(input.sourceRawValue ?? "").trim();
    const text = [rawValue, sourceRawValue].filter(Boolean).join(" ");
    if (!rawValue || !COMPOSITE_PATTERN.test(text)) return null;
    if (UNIT_PATTERN.test(rawValue) && !/[、，,\/／|]/u.test(rawValue)) return null;
    return {
      detector: this.name,
      relationType: "composite_value",
      recommendedAction: "split_value",
      confidence: 0.78,
      riskLevel: "medium",
      reason: "字段值包含多个分隔或并列概念，可能需要拆分而不是创建单一 enum value",
      evidence: { rawValue, sourceRawValue: sourceRawValue || undefined },
      blocksAutoApply: true,
    };
  }
}

class ScopeContaminationDetector implements Detector {
  name = "ScopeContaminationDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    const rawFieldName = String(input.rawFieldName ?? input.termType ?? "");
    const rawValue = String(input.rawValue ?? "");
    const text = `${rawFieldName} ${rawValue}`;
    if (!DOC_SCOPE_PATTERN.test(text)) return null;
    if (input.scope === "document") return null;
    return {
      detector: this.name,
      relationType: "wrong_scope",
      recommendedAction: "move_scope",
      confidence: 0.82,
      riskLevel: "high",
      reason: "候选包含合同/订单/客户等文档级信息，疑似污染产品配置作用域",
      evidence: { rawFieldName, rawValue, scope: input.scope ?? "unknown" },
      blocksAutoApply: true,
    };
  }
}

class CrossTermTypeValueDetector implements Detector {
  name = "CrossTermTypeValueDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    if (input.candidateType !== "value") return null;
    const matches = (input.knownValueAliasTermTypes ?? []).filter(
      (termType) => termType !== input.termType,
    );
    if (matches.length === 0) return null;
    return {
      detector: this.name,
      relationType: "different_concept",
      recommendedAction: "send_to_review",
      confidence: 0.83,
      riskLevel: "high",
      reason: "字段值命中了其它 termType 的已有 value alias，可能是跨字段概念错误",
      evidence: { currentTermType: input.termType, matchedTermTypes: matches },
      blocksAutoApply: true,
    };
  }
}

class MultiItemSignalDetector implements Detector {
  name = "MultiItemSignalDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    const text = `${input.rawFieldName ?? ""} ${input.rawValue ?? ""}`;
    const hasRuleSignal = (input.ruleSignals ?? []).some(
      (signal) => signal.ruleId === "indexed_instance_normalized",
    );
    if (!hasRuleSignal && !MULTI_ITEM_PATTERN.test(text)) return null;
    return {
      detector: this.name,
      relationType: "extraction_error",
      recommendedAction: "mark_extraction_error",
      confidence: hasRuleSignal ? 0.9 : 0.76,
      riskLevel: "medium",
      reason: "候选带有多 item/实例信号，优先视为 extraction structure 问题",
      evidence: { text, ruleSignals: input.ruleSignals ?? [] },
      blocksAutoApply: true,
    };
  }
}

class NonConfigNoiseDetector implements Detector {
  name = "NonConfigNoiseDetector";

  detect(input: DetectionInput): ConceptIssue | null {
    const field = String(input.rawFieldName ?? "").trim();
    const value = String(input.rawValue ?? "").trim();
    if (!NON_CONFIG_PATTERN.test(field) && !(field.length <= 2 && !value)) {
      return null;
    }
    return {
      detector: this.name,
      relationType: "non_config_noise",
      recommendedAction: "mark_non_config",
      confidence: 0.8,
      riskLevel: "low",
      reason: "候选更像非配置字段或表格噪声",
      evidence: { field, value },
      blocksAutoApply: true,
    };
  }
}

export class ConceptIssueDetectorService {
  private readonly detectors: Detector[] = [
    new ValueAsTypeDetector(),
    new QualifierVariantDetector(),
    new CompositeValueDetector(),
    new ScopeContaminationDetector(),
    new CrossTermTypeValueDetector(),
    new MultiItemSignalDetector(),
    new NonConfigNoiseDetector(),
  ];

  detect(input: DetectionInput): ConceptIssue[] {
    return this.detectors
      .map((detector) => detector.detect(input))
      .filter((issue): issue is ConceptIssue => Boolean(issue))
      .sort((left, right) => right.confidence - left.confidence);
  }
}
