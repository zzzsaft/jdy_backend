import type { LlmRawField } from "../../extraction/types.js";
import type { DictionaryExtractionNote } from "../types.js";

const NOTE_FIELD_PATTERN =
  /(?:客户.*备注|客户.*特别|客户.*注明|订单备注|特别备注|特别注明|备注)(?:[0-9一二三四])?$/u;

export function isCustomerNoteFieldName(fieldName: string): boolean {
  return NOTE_FIELD_PATTERN.test(String(fieldName ?? "").replace(/\s+/g, ""));
}

export function createExtractionNote(params: {
  rawField: LlmRawField;
  itemIndex: number;
  documentId?: string;
  extractionResultId?: string;
}): DictionaryExtractionNote {
  return {
    field_name: params.rawField.field_name,
    raw_value: params.rawField.value,
    raw_text: params.rawField.raw_text,
    evidence: params.rawField.evidence,
    item_index: params.itemIndex,
    document_id: params.documentId,
    extraction_result_id: params.extractionResultId,
  };
}

export function reparseCustomerNote(rawField: LlmRawField): LlmRawField[] {
  const text = [rawField.value, rawField.raw_text]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) return [];

  return [
    ...parseHeatingRodAngles(text, rawField),
    ...parseThermocoupleHoleDirection(text, rawField),
  ];
}

function parseHeatingRodAngles(text: string, source: LlmRawField): LlmRawField[] {
  const result: LlmRawField[] = [];
  const pattern = /(上模|下模|上下模)?\s*加热棒(?:角度)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:°|度)/gu;
  for (const match of text.matchAll(pattern)) {
    const qualifierText = match[1] ?? "";
    const angle = match[2];
    if (!angle) continue;

    const targets = qualifierText === "上下模" ? ["上模", "下模"] : [qualifierText];
    for (const target of targets) {
      result.push(makeNoteField({
        source,
        fieldName: [target, "加热棒角度"].filter(Boolean).join(""),
        value: `${angle}°`,
        matchedText: match[0],
        confidence: target ? 0.72 : 0.62,
      }));
    }
  }
  return result;
}

function parseThermocoupleHoleDirection(
  text: string,
  source: LlmRawField,
): LlmRawField[] {
  const match = text.match(/测温孔方向\s*(?:朝|向|为|:|：)?\s*([^,，;；。\n]+)/u);
  if (!match) return [];
  const direction = match[1]?.trim();
  if (!direction) return [];

  return [
    makeNoteField({
      source,
      fieldName: "测温孔方向",
      value: direction,
      matchedText: match[0],
      confidence: 0.68,
    }),
  ];
}

function makeNoteField(params: {
  source: LlmRawField;
  fieldName: string;
  value: string;
  matchedText: string;
  confidence: number;
}): LlmRawField {
  return {
    field_name: params.fieldName,
    value: params.value,
    raw_text: params.source.raw_text,
    selected: params.source.selected,
    confidence: params.confidence,
    evidence: {
      ...(objectRecord(params.source.evidence) ?? {}),
      source: "customer_note_reparse",
      sourceRawFieldName: params.source.field_name,
      sourceRawValue: params.source.value,
      matchedText: params.matchedText,
      requiresReview: true,
    },
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
