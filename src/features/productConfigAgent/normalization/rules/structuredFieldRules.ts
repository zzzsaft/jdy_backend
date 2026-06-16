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

    if (
      (termType === "throughput" || termType === "capacity") &&
      isLayeredThroughputFieldName(rawFieldName)
    ) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    if (
      termType === "plastic_material" &&
      isLayeredMaterialFieldName(rawFieldName)
    ) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    if (termType === "pressure" && isPumpPressureFieldName(rawFieldName)) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    if (termType === "lip_gap" && isLipGapStructuredFieldName(rawFieldName)) {
      return withNormalizedValueLabel(field, rawFieldName, rawValue);
    }

    if (
      isInsertBlockTermType(termType) &&
      isInsertBlockStructuredFieldName(rawFieldName)
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

function isLayeredThroughputFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  if (!/产量/.test(compact)) {
    return false;
  }

  if (
    /(?:[A-Ea-e]|[一二三四五六七八九十]|表|芯|中间|内|外|上|下)[层]/.test(
      compact,
    )
  ) {
    return true;
  }

  return false;
}

function isLayeredMaterialFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  if (!/(原料|材料|材质)/.test(compact)) {
    return false;
  }

  if (
    /(?:[A-Ea-e]|[一二三四五六七八九十]|表|芯|中间|内|外|上|下)[层]/.test(
      compact,
    )
  ) {
    return true;
  }

  return false;
}

function isPumpPressureFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  return /泵[前后]压力/.test(compact) || /压力[前后]泵/.test(compact);
}

function isLipGapStructuredFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }

  if (/开口尺寸[（(]?(?:第?[一二三四五六七八九十0-9]+套|第?[一二三四五六七八九十0-9]+Sheet)?[）)]?/.test(compact)) {
    return true;
  }

  if (/(?:第?[一二三四五六七八九十0-9]+套|第?[一二三四五六七八九十0-9]+Sheet).*模唇.*(?:厚度|开口|间隙)/.test(compact)) {
    return true;
  }

  if (/模唇厚度调节范围[（(]?(?:第?[一二三四五六七八九十0-9]+套|第?[一二三四五六七八九十0-9]+Sheet)[）)]?/.test(compact)) {
    return true;
  }

  return false;
}

function isInsertBlockTermType(termType: string): boolean {
  return [
    "insert_block_material",
    "insert_block_internal_structure",
    "insert_block_surface_roughness",
  ].includes(termType);
}

function isInsertBlockStructuredFieldName(rawFieldName: string): boolean {
  const compact = rawFieldName.replace(/\s+/g, "");
  if (!compact || !/镶块/.test(compact)) {
    return false;
  }

  return /(材质|材料|内部结构|表面粗糙度|粗糙度)/.test(compact);
}
