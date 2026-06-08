import {
  DeepSeekExtractResult,
  LlmExtractionItem,
  LlmExtractionResult,
  LlmFieldValue,
  LlmRawField,
} from "./types";

type JsonObject = Record<string, unknown>;

export function parseJsonContent(content: string): unknown {
  return JSON.parse(content);
}

export function validateLlmExtractionResult(
  value: unknown,
): LlmExtractionResult {
  if (!isObject(value)) {
    throw new Error("DeepSeek JSON result must be an object");
  }

  const extraction = value.extraction;
  if (!isObject(extraction)) {
    throw new Error('DeepSeek JSON result is missing required field "extraction"');
  }

  if (!Array.isArray(extraction.items)) {
    throw new Error('DeepSeek JSON result "extraction.items" must be an array');
  }

  const documentInfo = validateDocumentInfo(extraction.document_info);
  const items = extraction.items.map((item, itemIndex) =>
    validateExtractionItem(item, itemIndex),
  );
  const warnings = validateWarnings(value.warnings);

  return {
    extraction: {
      ...(documentInfo ? { document_info: documentInfo } : {}),
      items,
    },
    warnings,
  };
}

export function validateExtractResult(value: unknown): DeepSeekExtractResult {
  return validateLlmExtractionResult(value);
}

function validateDocumentInfo(
  value: unknown,
): Record<string, LlmFieldValue> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isObject(value)) {
    throw new Error('"extraction.document_info" must be an object when present');
  }

  const documentInfo: Record<string, LlmFieldValue> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    documentInfo[key] = validateFieldValue(
      fieldValue,
      `extraction.document_info.${key}`,
    );
  }

  return documentInfo;
}

function validateExtractionItem(
  value: unknown,
  itemIndex: number,
): LlmExtractionItem {
  if (!isObject(value)) {
    throw new Error(`extraction.items[${itemIndex}] must be an object`);
  }

  if (typeof value.item_index !== "number") {
    throw new Error(`extraction.items[${itemIndex}].item_index must be a number`);
  }

  if (!Array.isArray(value.raw_fields)) {
    throw new Error(`extraction.items[${itemIndex}].raw_fields must be an array`);
  }

  const itemName =
    value.item_name === undefined || value.item_name === null
      ? undefined
      : validateFieldValue(value.item_name, `extraction.items[${itemIndex}].item_name`);

  return {
    item_index: value.item_index,
    ...(itemName ? { item_name: itemName } : {}),
    raw_fields: value.raw_fields.map((rawField, rawFieldIndex) =>
      validateRawField(rawField, itemIndex, rawFieldIndex),
    ),
  };
}

function validateRawField(
  value: unknown,
  itemIndex: number,
  rawFieldIndex: number,
): LlmRawField {
  const path = `extraction.items[${itemIndex}].raw_fields[${rawFieldIndex}]`;

  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }

  if (Object.prototype.hasOwnProperty.call(value, "canonical_value")) {
    throw new Error(`${path} must not include canonical_value`);
  }

  if (Object.prototype.hasOwnProperty.call(value, "term_type")) {
    throw new Error(`${path} must not include term_type`);
  }

  if (Object.prototype.hasOwnProperty.call(value, "parsed_value")) {
    throw new Error(`${path} must not include parsed_value`);
  }

  if (typeof value.field_name !== "string") {
    throw new Error(`${path}.field_name must be a string`);
  }

  if (typeof value.value !== "string") {
    throw new Error(`${path}.value must be a string`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, "evidence")) {
    throw new Error(`${path}.evidence is required`);
  }

  if (typeof value.confidence !== "number") {
    throw new Error(`${path}.confidence must be a number`);
  }

  return {
    field_name: value.field_name,
    value: value.value,
    ...(typeof value.selected === "boolean" ? { selected: value.selected } : {}),
    ...(typeof value.raw_text === "string" ? { raw_text: value.raw_text } : {}),
    evidence: value.evidence,
    confidence: value.confidence,
  };
}

function validateFieldValue(value: unknown, path: string): LlmFieldValue {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }

  if (typeof value.value !== "string") {
    throw new Error(`${path}.value must be a string`);
  }

  if (!Object.prototype.hasOwnProperty.call(value, "evidence")) {
    throw new Error(`${path}.evidence is required`);
  }

  if (typeof value.confidence !== "number") {
    throw new Error(`${path}.confidence must be a number`);
  }

  return {
    value: value.value,
    evidence: value.evidence,
    confidence: value.confidence,
  };
}

function validateWarnings(
  value: unknown,
): LlmExtractionResult["warnings"] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('"warnings" must be an array when present');
  }

  return value.map((warning, index) => {
    if (!isObject(warning)) {
      throw new Error(`warnings[${index}] must be an object`);
    }

    if (typeof warning.type !== "string") {
      throw new Error(`warnings[${index}].type must be a string`);
    }

    if (typeof warning.message !== "string") {
      throw new Error(`warnings[${index}].message must be a string`);
    }

    return {
      type: warning.type,
      message: warning.message,
      ...(Object.prototype.hasOwnProperty.call(warning, "evidence")
        ? { evidence: warning.evidence }
        : {}),
    };
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
