import type { LlmRawField, LlmSplitField } from "../../extraction/types.js";

export function splitThermocoupleAndPressureHoleField(
  rawField: LlmRawField,
): LlmSplitField[] {
  const fieldName = String(rawField.field_name ?? "").replace(/\s+/g, "");
  if (!/(?:测温孔|热电偶孔).*(?:压力孔|压力传感器孔)|(?:压力孔|压力传感器孔).*(?:测温孔|热电偶孔)/.test(fieldName)) {
    return [];
  }

  const value = String(rawField.value ?? "").trim();
  if (!value) return [];

  const baseEvidence = {
    ...(objectRecord(rawField.evidence) ?? {}),
    sourceRawFieldName: rawField.field_name,
    sourceRawValue: rawField.value,
    splitRule: "thermocouple_pressure_hole_composite",
  };
  const thermocoupleFieldName =
    extractHoleSegment(fieldName, /(?:网前|网后)?(?:测温孔|热电偶孔)/) ?? "测温孔";
  const pressureFieldName =
    extractHoleSegment(fieldName, /(?:网前|网后)?(?:压力孔|压力传感器孔)/) ?? "压力孔";

  return [
    {
      field_name: "热电偶孔规格",
      value,
      raw_text: rawField.raw_text ?? rawField.value,
      evidence: {
        ...baseEvidence,
        originalSplitFieldName: thermocoupleFieldName,
      },
      confidence: rawField.confidence,
      reason: "测温孔及压力孔复合字段拆分",
    },
    {
      field_name: "压力传感器孔配置",
      value,
      raw_text: rawField.raw_text ?? rawField.value,
      evidence: {
        ...baseEvidence,
        originalSplitFieldName: pressureFieldName,
      },
      confidence: rawField.confidence,
      reason: "测温孔及压力孔复合字段拆分",
    },
  ];
}

function extractHoleSegment(fieldName: string, pattern: RegExp): string | undefined {
  return fieldName.match(pattern)?.[0];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
