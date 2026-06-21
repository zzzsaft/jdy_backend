import type { LlmRawField } from "../../extraction/types.js";
import type {
  DictionaryExtractionField,
  DictionaryExtractionQualifier,
  DictionaryExtractionQualifierPosition,
  DictionaryExtractionRoughness,
} from "../types.js";
import type { NormalizedNumberUnit } from "../../dictionary/numberUnit.js";
import { getRuntimeQualifierMatcher } from "../../dictionary/qualifierMatcher.js";
import { isQualifiedTermType } from "./qualifiedTermTypes.js";

const VOLTAGE_TERM_TYPES = new Set([
  "heating_voltage",
  "motor_voltage",
  "pump_heating_voltage",
]);

const VOLTAGE_SPLIT_TERM_TYPES: Record<
  string,
  { frequency: string; phase: string }
> = {
  heating_voltage: {
    frequency: "heating_frequency",
    phase: "heating_phase",
  },
  motor_voltage: {
    frequency: "motor_frequency",
    phase: "motor_phase",
  },
  pump_heating_voltage: {
    frequency: "heating_frequency",
    phase: "heating_phase",
  },
};

export function extractQualifier(params: {
  fieldName?: string;
  rawValue?: string;
  evidence?: unknown;
  termType?: string;
}): DictionaryExtractionQualifier | undefined {
  if (params.termType && !isQualifiedTermType(params.termType)) {
    return undefined;
  }

  const evidence = objectRecord(params.evidence);
  const sourceTexts = [
    params.fieldName,
    evidence?.originalSplitFieldName,
    evidence?.text,
    params.rawValue,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const detected = getRuntimeQualifierMatcher().detect(sourceTexts);
  const position = detected.qualifier?.position;
  const area = detected.qualifier?.area;
  if (!position && !area) return undefined;
  return {
    position,
    area,
    sourceText: detected.qualifier?.sourceText ?? detected.sourceText,
  };
}

export function applyQualifier(field: DictionaryExtractionField): void {
  const qualifier = extractQualifier({
    fieldName: field.field_name,
    rawValue: field.raw_value,
    evidence: field.evidence,
    termType: field.dictionary.term_type,
  });
  if (!qualifier) {
    return;
  }
  field.qualifier = {
    ...qualifier,
    ...field.qualifier,
    sourceText: field.qualifier?.sourceText ?? qualifier.sourceText,
  };
}

export function expandBothMoldQualifier(
  field: DictionaryExtractionField,
): DictionaryExtractionField[] {
  const termType = field.dictionary.term_type;
  if (!termType || !isQualifiedTermType(termType)) {
    return [field];
  }

  const evidence = objectRecord(field.evidence);
  const sourceText = [
    field.field_name,
    evidence?.originalFieldName,
    evidence?.originalSplitFieldName,
    evidence?.text,
    field.raw_value,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .find((value) => /上下模|上\/下模|上、下模|上和下模/.test(value.replace(/\s+/g, "")));

  if (!sourceText) {
    return [field];
  }

  return [
    cloneWithQualifier(field, "upper_die", sourceText),
    cloneWithQualifier(field, "lower_die", sourceText),
  ];
}

export function parseVoltageComposite(rawValue: string): {
  voltage?: string;
  frequency?: string;
  phase?: string;
} | null {
  const text = String(rawValue ?? "").trim();
  if (!text) return null;

  const voltageMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:V|伏)/i);
  const frequencyMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:Hz|赫兹)/i);
  const phaseMatch = text.match(/(单相|三相|1\s*相|3\s*相)/i);
  if (!voltageMatch && !frequencyMatch && !phaseMatch) {
    return null;
  }

  const phase = phaseMatch?.[1]
    ? phaseMatch[1].replace(/\s+/g, "").replace(/^1相$/i, "单相").replace(/^3相$/i, "三相")
    : undefined;

  return {
    voltage: voltageMatch?.[1] ? `${voltageMatch[1]}V` : undefined,
    frequency: frequencyMatch?.[1] ? `${frequencyMatch[1]}Hz` : undefined,
    phase,
  };
}

export function applyVoltageComposite(field: DictionaryExtractionField): {
  splitFields: LlmRawField[];
} {
  const termType = field.dictionary.term_type;
  if (!termType || !VOLTAGE_TERM_TYPES.has(termType)) {
    return { splitFields: [] };
  }

  const parsed = parseVoltageComposite(field.raw_value);
  if (!parsed) {
    return { splitFields: [] };
  }

  if (parsed.voltage) {
    field.raw_value = parsed.voltage;
    field.dictionary.normalized_value = parsed.voltage;
    if (termType === "pump_heating_voltage") {
      field.field_name = "heating_voltage";
      field.dictionary.term_type = "heating_voltage";
      field.dictionary.display_name = "加热电压";
    }
    if (field.dictionary.number_unit) {
      field.dictionary.number_unit = {
        ...field.dictionary.number_unit,
        normalizedValue: parsed.voltage,
      };
    }
  }

  const targets = VOLTAGE_SPLIT_TERM_TYPES[termType];
  const splitFields: LlmRawField[] = [];
  if (parsed.frequency) {
    splitFields.push(makeVoltageSplitField(field, targets.frequency, parsed.frequency));
  }
  if (parsed.phase) {
    splitFields.push(makeVoltageSplitField(field, targets.phase, parsed.phase));
  }

  return { splitFields };
}

export function normalizeStandaloneVoltagePart(rawField: LlmRawField):
  | {
      normalizedFieldName: string;
      normalizedValue: string;
      termType: string;
      valueKind: "number_unit" | "enum";
      canonicalValue?: string;
      displayName?: string;
      numberUnit?: NormalizedNumberUnit;
    }
  | undefined {
  const fieldName = String(rawField.field_name ?? "").replace(/\s+/g, "");
  const rawValue = String(rawField.value ?? "").trim();
  if (!fieldName || !rawValue) {
    return undefined;
  }

  const frequencyMatch = rawValue.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:Hz|赫兹)$/i);
  if (/^(?:加热)?频率$/.test(fieldName) && frequencyMatch?.[1]) {
    const normalizedValue = `${frequencyMatch[1]}Hz`;
    return {
      normalizedFieldName: "加热频率",
      normalizedValue,
      termType: "heating_frequency",
      valueKind: "number_unit",
      numberUnit: {
        rawValue,
        numericText: frequencyMatch[1],
        numberKind: "single",
        value: frequencyMatch[1],
        unitRaw: rawValue.replace(frequencyMatch[1], "").trim() || "Hz",
        normalizedUnitRaw: "hz",
        normalizedValue,
        warnings: [],
      },
    };
  }

  const phaseMatch = rawValue.match(/^(单相|三相|1\s*相|3\s*相)$/i);
  if (/^(?:加热)?(?:相|相数)$/.test(fieldName) && phaseMatch?.[1]) {
    const normalizedValue = phaseMatch[1]
      .replace(/\s+/g, "")
      .replace(/^1相$/i, "单相")
      .replace(/^3相$/i, "三相");
    return {
      normalizedFieldName: "相",
      normalizedValue,
      termType: "heating_phase",
      valueKind: "enum",
      canonicalValue: normalizedValue,
      displayName: normalizedValue,
    };
  }

  return undefined;
}

export function parseRoughness(rawValue: string): DictionaryExtractionRoughness | undefined {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return undefined;

  const result: DictionaryExtractionRoughness = { raw };
  const gradeMatch = raw.match(/(^|[^A-Za-z])([A-DＡ-Ｄ])\s*级/i);
  if (gradeMatch?.[2]) {
    result.grade = gradeMatch[2].toUpperCase();
  }

  const unitMatch = raw.match(/(μm|um)/i);
  if (unitMatch?.[1]) {
    result.unit = unitMatch[1].toLowerCase() === "um" ? "um" : "μm";
  }

  const rangeMatch = raw.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(?:-|~|～|至|到)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:μm|um)?/i,
  );
  if (rangeMatch) {
    result.rangeMin = Number(rangeMatch[1]);
    result.rangeMax = Number(rangeMatch[2]);
    return result;
  }

  const boundMatch = raw.match(
    /(小于等于|不大于|≤|<=|小于|低于|<|大于等于|不小于|≥|>=|大于|高于|>)\s*(?:Ra)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:μm|um)?/i,
  );
  if (boundMatch) {
    result.bound = boundFromText(boundMatch[1]);
    result.value = Number(boundMatch[2]);
    return result;
  }

  const valueMatch = raw.match(/(?:Ra)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:μm|um)?/i);
  if (valueMatch) {
    result.value = Number(valueMatch[1]);
    return result;
  }

  return result.grade || result.unit ? result : undefined;
}

export function applyRoughness(field: DictionaryExtractionField): void {
  const termType = field.dictionary.term_type ?? "";
  if (termType !== "surface_roughness" && !termType.endsWith("_surface_roughness")) {
    return;
  }

  const roughness = parseRoughness(field.raw_value);
  if (roughness) {
    field.dictionary.roughness = roughness;
  }
}

function makeVoltageSplitField(
  source: DictionaryExtractionField,
  fieldName: string,
  value: string,
): LlmRawField {
  return {
    field_name: fieldName,
    value,
    raw_text: source.raw_text,
    selected: source.selected,
    evidence: {
      ...(objectRecord(source.evidence) ?? {}),
      sourceRawFieldName: source.field_name,
      sourceRawValue: source.raw_value,
      splitRule: "voltage_frequency_phase",
    },
    confidence: source.llm_confidence ?? 0.8,
    qualifier: source.qualifier,
  };
}

function cloneWithQualifier(
  field: DictionaryExtractionField,
  position: DictionaryExtractionQualifierPosition,
  sourceText: string,
): DictionaryExtractionField {
  return {
    ...field,
    qualifier: {
      position,
      sourceText,
    },
    dictionary: {
      ...field.dictionary,
      values: field.dictionary.values
        ? field.dictionary.values.map((value) => ({ ...value }))
        : undefined,
      number_unit: field.dictionary.number_unit
        ? { ...field.dictionary.number_unit }
        : undefined,
      roughness: field.dictionary.roughness
        ? { ...field.dictionary.roughness }
        : undefined,
    },
    warnings: [...field.warnings],
  };
}

function boundFromText(value: string): DictionaryExtractionRoughness["bound"] {
  if (/小于等于|不大于|≤|<=/.test(value)) return "lte";
  if (/大于等于|不小于|≥|>=/.test(value)) return "gte";
  if (/大于|高于|>/.test(value)) return "gt";
  return "lt";
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
