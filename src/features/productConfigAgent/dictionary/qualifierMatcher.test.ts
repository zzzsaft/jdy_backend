import assert from "node:assert/strict";
import {
  buildQualifierMatcher,
  setRuntimeQualifierMatcher,
} from "./qualifierMatcher.js";
import { detectQualifierConcept } from "./qualifierConcept.js";
import { applyQualifier } from "../normalization/rules/qualifierRules.js";
import type { DictionaryExtractionField } from "../normalization/types.js";

const matcher = buildQualifierMatcher([
  {
    qualifierKey: "channel",
    kind: "area",
    displayName: "流道",
    aliases: ["秘密流道", "A+B"],
    sortOrder: 10,
  },
  {
    qualifierKey: "post_mesh",
    kind: "position",
    displayName: "网后",
    aliases: ["网后侧"],
    sortOrder: 20,
  },
]);

assert.equal(matcher.findMatches("流道抛光精度")[0]?.qualifierKey, "channel");
assert.equal(matcher.findMatches("秘密流道抛光精度")[0]?.matchedAlias, "秘密流道");
assert.equal(matcher.findMatches("channel抛光精度")[0]?.qualifierKey, "channel");
assert.equal(matcher.findMatches("A+B抛光精度")[0]?.matchedAlias, "A+B");
assert.equal(matcher.findMatches("AAAB抛光精度").length, 0);
assert.equal(matcher.findMatches("网后侧压力孔")[0]?.qualifierKey, "post_mesh");

setRuntimeQualifierMatcher(matcher);

const concept = detectQualifierConcept({
  fieldName: "秘密流道抛光精度",
});
assert.equal(concept?.qualifier?.area, "channel");
assert.equal(concept?.matchedQualifierAlias, "秘密流道");
assert.equal(concept?.qualifierKey, "channel");
assert.equal(concept?.qualifierKind, "area");
assert.equal(concept?.rule, "runtime_qualifier_matcher");

const field = {
  field_name: "秘密流道抛光精度",
  raw_value: "Ra0.15",
  raw_text: "秘密流道抛光精度 Ra0.15",
  evidence: {},
  selected: undefined,
  llm_confidence: 0.95,
  dictionary: {
    matched: true,
    field_matched: true,
    normalized_field_name: "秘密流道抛光精度",
    normalized_value: "Ra0.15",
    term_type: "surface_roughness",
    value_kind: "text",
  },
  warnings: [],
} as DictionaryExtractionField;
applyQualifier(field);
assert.equal(field.qualifier?.area, "channel");
assert.equal(field.qualifier?.sourceText, "秘密流道");

setRuntimeQualifierMatcher(buildQualifierMatcher([]));

console.log("qualifier matcher tests passed");
