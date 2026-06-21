import type { LlmRawField } from "../../extraction/types.js";

const LAYER_FIELD_PATTERN = /([A-DＡ-Ｄ])\s*(?:层|区|主机)/i;
const EXTRUDER_COMPONENT_PATTERN =
  /(?:挤出机|主机|螺杆|型号|产量|产能|原料|材料|配方)/;

type GroupedField = {
  layer: string;
  sourceText: string;
  fields: LlmRawField[];
  firstIndex: number;
};

export function groupLayerExtruderConfigFields(
  rawFields: LlmRawField[],
): LlmRawField[] {
  const expandedFields = rawFields.flatMap(expandCombinedHostField);
  const groups = new Map<string, GroupedField>();

  expandedFields.forEach((field, index) => {
    const searchable = [field.field_name, field.raw_text, evidenceText(field.evidence)]
      .map((value) => String(value ?? ""))
      .join(" ");
    const match = searchable.match(LAYER_FIELD_PATTERN);
    if (!match?.[1] || !EXTRUDER_COMPONENT_PATTERN.test(searchable)) return;

    const layer = normalizeLayer(match[1]);
    const existing = groups.get(layer);
    if (existing) {
      existing.fields.push(field);
    } else {
      groups.set(layer, {
        layer,
        sourceText: match[0],
        fields: [field],
        firstIndex: index,
      });
    }
  });

  const eligibleGroups = [...groups.values()].filter((group) =>
    shouldGroup(group),
  );
  if (eligibleGroups.length === 0) return expandedFields;

  const replacements = new Map<number, LlmRawField>();
  const groupedIndexes = new Set<number>();
  for (const group of eligibleGroups) {
    replacements.set(group.firstIndex, makeGroupedField(group));
    for (const field of group.fields) {
      const index = expandedFields.indexOf(field);
      if (index >= 0) groupedIndexes.add(index);
    }
  }

  return expandedFields.flatMap((field, index) => {
    const replacement = replacements.get(index);
    if (replacement) return [replacement];
    return groupedIndexes.has(index) ? [] : [field];
  });
}

function expandCombinedHostField(field: LlmRawField): LlmRawField[] {
  const value = String(field.value ?? "");
  const matches = [...value.matchAll(/([A-DＡ-Ｄ])\s*主机([^，,；;]*?)(?=(?:[，,；;]\s*)*[A-DＡ-Ｄ]\s*主机|[）)]|$)/giu)];
  if (matches.length < 2) return [field];

  const result: LlmRawField[] = [];
  const prefix = value
    .slice(0, matches[0].index ?? 0)
    .replace(/[（(，,；;\s]+$/g, "")
    .trim();
  if (prefix) {
    const { split_fields: _discardedHostSplits, ...baseField } = field;
    result.push({
      ...baseField,
      value: prefix,
      raw_text: prefix,
      evidence: {
        ...(objectRecord(field.evidence) ?? {}),
        text: prefix,
        splitRule: "combined_host_extruder_config",
      },
    });
  }

  for (const match of matches) {
    const layer = normalizeLayer(match[1]);
    const detail = String(match[2] ?? "").trim();
    const output = detail.match(/产量\s*[:：]?\s*(.+)$/u)?.[1]?.trim() ?? detail;
    const material = detail.match(/^(.+?)产量/u)?.[1]?.trim() ?? "";
    result.push({
      field_name: `${layer}主机${material}产量`,
      value: output,
      raw_text: match[0],
      confidence: field.confidence,
      evidence: {
        ...(objectRecord(field.evidence) ?? {}),
        text: match[0],
        sourceRawFieldName: field.field_name,
        sourceRawValue: field.value,
        splitRule: "combined_host_extruder_config",
      },
    });
  }
  return result;
}

function shouldGroup(group: GroupedField): boolean {
  if (group.fields.length > 1) return true;
  const field = group.fields[0];
  const text = [field.field_name, field.value, field.raw_text]
    .map((value) => String(value ?? ""))
    .join(" ");
  return /(?:产量|产能|原料|材料|配方)/.test(text);
}

function makeGroupedField(group: GroupedField): LlmRawField {
  const parts = group.fields.map((field) => ({
    fieldName: field.field_name,
    value: field.value,
    rawText: field.raw_text,
  }));
  const value = parts
    .map((part) => `${part.fieldName}=${part.value}`)
    .join("；");
  const rawText = parts
    .map((part) => part.rawText || `${part.fieldName}：${part.value}`)
    .join("\n");

  return {
    field_name: "挤出机型号",
    value,
    raw_text: rawText,
    confidence: Math.min(...group.fields.map((field) => field.confidence ?? 0.8)),
    qualifier: {
      layer: group.layer,
      sourceText: group.sourceText,
    },
    evidence: {
      source: "layer_extruder_config_group",
      sourceFields: parts,
      ruleSignals: [
        {
          ruleId: "layer_extruder_config_grouped",
          relationType: "qualifier_variant",
          recommendedAction: "map_as_qualifier_variant",
          confidence: 0.92,
          before: parts,
          after: {
            fieldName: "挤出机型号",
            qualifier: { layer: group.layer },
          },
        },
      ],
    },
  };
}

function normalizeLayer(value: string): string {
  return value
    .replace(/[Ａ-Ｄ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .toUpperCase();
}

function evidenceText(evidence: unknown): string | undefined {
  const text = objectRecord(evidence)?.text;
  return typeof text === "string" ? text : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
