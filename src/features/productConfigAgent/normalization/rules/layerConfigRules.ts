import type { LlmRawField, LlmSplitField } from "../../extraction/types.js";
import { detectQualifierConcept } from "../../dictionary/qualifierConcept.js";

const EXTRUDER_MODEL_PATTERN =
  /((?:SJ[-\s]?)?(?:[Φφ]\s*)?[0-9]+(?:\.[0-9]+)?\s*(?:mm|毫米)?)(?:\s*(?:挤出机|螺杆))/i;
const OUTPUT_PATTERN =
  /(?:产量|产能)?\s*([0-9]+(?:\.[0-9]+)?\s*(?:kg\/h|kg\s*\/\s*h|公斤\/小时|千克\/小时)(?:\s*(?:以下|以内|以上|左右))?)/i;
const MATERIAL_PATTERN =
  /(?:原料|材料|树脂)[:：]?\s*([A-Za-z0-9+\-_/／、，,]+)(?=$|[\s，,；;])/i;

export function splitLayerConfigCompositeField(
  rawField: LlmRawField,
): LlmSplitField[] {
  const qualifierConcept = detectQualifierConcept({
    fieldName: rawField.field_name,
    rawValue: rawField.value,
    evidence: rawField.evidence,
  });
  const qualifier = qualifierConcept?.qualifier;
  if (!qualifier?.layer && !qualifier?.layerIndex) {
    return [];
  }

  const text = [
    rawField.field_name,
    rawField.value,
    rawField.raw_text,
    evidenceText(rawField.evidence),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const components: string[] = [];
  const modelMatch = text.match(EXTRUDER_MODEL_PATTERN);
  if (modelMatch?.[1]) {
    components.push(`型号=${modelMatch[1].trim()}`);
  }

  const outputMatch = text.match(OUTPUT_PATTERN);
  if (outputMatch?.[1]) {
    components.push(`产量=${outputMatch[1].trim()}`);
  }

  const materialMatch = text.match(MATERIAL_PATTERN);
  if (materialMatch?.[1]) {
    components.push(`原料=${materialMatch[1].trim()}`);
  }

  return components.length >= 2
    ? [makeLayerSplitField(rawField, "挤出机型号", components.join("；"), qualifier)]
    : [];
}

function makeLayerSplitField(
  rawField: LlmRawField,
  fieldName: string,
  value: string,
  qualifier: NonNullable<LlmRawField["qualifier"]>,
): LlmSplitField {
  return {
    field_name: fieldName,
    value: value.trim(),
    raw_text: rawField.raw_text ?? rawField.value,
    evidence: {
      ...(objectRecord(rawField.evidence) ?? {}),
      sourceRawFieldName: rawField.field_name,
      sourceRawValue: rawField.value,
      splitRule: "layer_config_composite",
    },
    confidence: rawField.confidence,
    qualifier,
    reason: "层配置复合字段拆分",
  };
}

function evidenceText(evidence: unknown): string | undefined {
  const record = objectRecord(evidence);
  return typeof record?.text === "string" ? record.text : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
