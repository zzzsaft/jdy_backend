import type { LlmRawField } from "../../extraction/types.js";
import { splitFieldToRawField } from "../splitFields.js";

type SplitField = NonNullable<LlmRawField["split_fields"]>[number];

export function splitSelectionState(fieldName: string):
  | "selected"
  | "unselected"
  | null {
  const compact = String(fieldName ?? "").replace(/\s+/g, "");
  if (
    /(?:\(|\uff08)?\u672a\u9009\u4e2d(?:\)|\uff09)?/u.test(compact)
  ) {
    return "unselected";
  }
  if (/(?:\(|\uff08)?\u9009\u4e2d(?:\)|\uff09)?/u.test(compact)) {
    return "selected";
  }
  return null;
}

export function splitFieldToSelectionAwareRawField(
  parent: LlmRawField,
  splitField: SplitField,
): { rawField: LlmRawField | null; selectionState: "selected" | "unselected" | null } {
  const selectionState = splitSelectionState(splitField.field_name);
  if (selectionState === "unselected") {
    return { rawField: null, selectionState };
  }

  const rawField = splitFieldToRawField(parent, splitField);
  if (selectionState === "selected") {
    return {
      rawField: {
        ...rawField,
        field_name: parent.field_name,
        selected: true,
        evidence: mergeSelectionEvidence(rawField.evidence, splitField.field_name),
      },
      selectionState,
    };
  }

  return { rawField, selectionState };
}

function mergeSelectionEvidence(
  evidence: unknown,
  originalSplitFieldName: string,
): unknown {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { originalSplitFieldName };
  }
  return {
    ...(evidence as Record<string, unknown>),
    originalSplitFieldName,
  };
}
