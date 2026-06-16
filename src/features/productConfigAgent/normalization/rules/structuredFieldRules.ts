import type { DictionaryExtractionField } from "../types.js";

export function applyStructuredFieldLabels(
  fields: DictionaryExtractionField[],
): DictionaryExtractionField[] {
  return fields.map((field) => {
    const termType = field.dictionary.term_type;
    const rawFieldName = String(field.field_name ?? "").trim();
    const rawValue = String(field.raw_value ?? "").trim();
    if (!termType || !rawFieldName || !rawValue) {
      return field;
    }

    if (
      termType === "layer_ratio" &&
      isLayerRatioStructuredFieldName(rawFieldName)
    ) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    if (
      termType === "extruder_model" &&
      isExtruderModelStructuredFieldName(rawFieldName)
    ) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    return field;
  });
}

function withNormalizedValueLabel(
  field: DictionaryExtractionField,
  rawFieldName: string,
  rawValue: string,
): DictionaryExtractionField {
  return {
    ...field,
    dictionary: {
      ...field.dictionary,
      normalized_value: `${rawFieldName}: ${rawValue}`,
    },
  };
}

function isLayerRatioStructuredFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  if (/(复合比例|层比例|层配比|层占比)/i.test(compact)) {
    return true;
  }

  if (
    /(?:[A-Ea-e]|[一二三四五六七八九十]|表|芯|中间|内|外|上|下)[层]/.test(compact)
  ) {
    return true;
  }

  return false;
}

function isExtruderModelStructuredFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  if (!/挤出机/.test(compact)) {
    return false;
  }

  if (/型号/.test(compact)) {
    return true;
  }

  if (
    /(?:[A-Ea-e]|[一二三四五六七八九十]|主|副|表|芯|中间|内|外|上|下)[层]?挤出机/.test(
      compact,
    )
  ) {
    return true;
  }

  return false;
}
