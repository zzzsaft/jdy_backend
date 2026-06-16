import assert from "node:assert/strict";
import { normalizeNumberUnit, normalizeUnitAliasText } from "./numberUnit.js";

const aliases = new Map([
  ["mm", { id: "1", canonicalUnit: "mm", displayUnit: "mm" }],
  ["kg/h", { id: "2", canonicalUnit: "kg/h", displayUnit: "kg/h" }],
  ["hz", { id: "3", canonicalUnit: "Hz", displayUnit: "Hz" }],
  ["kw", { id: "4", canonicalUnit: "kW", displayUnit: "kW" }],
  ["kg", { id: "5", canonicalUnit: "kg", displayUnit: "kg" }],
  ["cm2", { id: "6", canonicalUnit: "cm2", displayUnit: "cm²" }],
  ["℃", { id: "7", canonicalUnit: "℃", displayUnit: "℃" }],
  ["m", { id: "8", canonicalUnit: "m", displayUnit: "m" }],
  ["转/分钟", { id: "9", canonicalUnit: "rpm", displayUnit: "rpm" }],
]);

assert.equal(normalizeUnitAliasText("cm³/rev"), "cm3/rev");
assert.equal(normalizeUnitAliasText("kg/hr"), "kg/h");
assert.equal(normalizeUnitAliasText("KG/每小时"), "kg/h");
assert.equal(normalizeUnitAliasText("kg以下/每小时"), "kg/h");
assert.equal(normalizeUnitAliasText("KW以内"), "kw");
assert.equal(normalizeUnitAliasText("℃左右"), "℃");
assert.equal(normalizeUnitAliasText("°"), "℃");
assert.equal(normalizeUnitAliasText("转可调/每分钟"), "转/分钟");

assert.deepEqual(pick(normalizeNumberUnit("1900MM", aliases)), {
  numericText: "1900",
  numberKind: "single",
  value: "1900",
  unitRaw: "MM",
  unitCanonical: "mm",
  normalizedValue: "1900 mm",
});

assert.deepEqual(pick(normalizeNumberUnit("3000-2000 kg/h", aliases)), {
  numericText: "3000-2000",
  numberKind: "range",
  rangeStart: "3000",
  rangeEnd: "2000",
  rangeMin: "2000",
  rangeMax: "3000",
  unitRaw: "kg/h",
  unitCanonical: "kg/h",
  normalizedValue: "3000-2000 kg/h",
});

assert.deepEqual(pick(normalizeNumberUnit("50Hz", aliases)), {
  numericText: "50",
  numberKind: "single",
  value: "50",
  unitRaw: "Hz",
  unitCanonical: "Hz",
  normalizedValue: "50 Hz",
});

assert.deepEqual(pick(normalizeNumberUnit("220 kg/hr", aliases)), {
  numericText: "220",
  numberKind: "single",
  value: "220",
  unitRaw: "kg/hr",
  unitCanonical: "kg/h",
  normalizedValue: "220 kg/h",
});

assert.deepEqual(pick(normalizeNumberUnit("5KW以内", aliases)), {
  numericText: "5",
  numberKind: "single",
  value: "5",
  unitRaw: "KW",
  unitCanonical: "kW",
  normalizedValue: "5 kW",
});

assert.deepEqual(pick(normalizeNumberUnit("0.7mm <客户要求>", aliases)), {
  numericText: "0.7",
  numberKind: "single",
  value: "0.7",
  unitRaw: "mm",
  unitCanonical: "mm",
  trailingText: "客户要求",
  normalizedValue: "0.7 mm",
});

assert.deepEqual(pick(normalizeNumberUnit("153CM2", aliases)), {
  numericText: "153",
  numberKind: "single",
  value: "153",
  unitRaw: "CM2",
  unitCanonical: "cm2",
  normalizedValue: "153 cm²",
});

assert.deepEqual(pick(normalizeNumberUnit("80-90℃", aliases)), {
  numericText: "80-90",
  numberKind: "range",
  rangeStart: "80",
  rangeEnd: "90",
  rangeMin: "80",
  rangeMax: "90",
  unitRaw: "℃",
  unitCanonical: "℃",
  normalizedValue: "80-90 ℃",
});

assert.deepEqual(pick(normalizeNumberUnit("10－80 转可调/每分钟", aliases)), {
  numericText: "10-80",
  numberKind: "range",
  rangeStart: "10",
  rangeEnd: "80",
  rangeMin: "10",
  rangeMax: "80",
  unitRaw: "转/分钟",
  unitCanonical: "rpm",
  normalizedValue: "10-80 rpm",
});

assert.deepEqual(pick(normalizeNumberUnit("600KG/每小时", aliases)), {
  numericText: "600",
  numberKind: "single",
  value: "600",
  unitRaw: "KG/小时",
  unitCanonical: "kg/h",
  normalizedValue: "600 kg/h",
});

assert.deepEqual(pick(normalizeNumberUnit("70kg以下/每小时", aliases)), {
  numericText: "70",
  numberKind: "single",
  value: "70",
  unitRaw: "kg/小时",
  unitCanonical: "kg/h",
  normalizedValue: "70 kg/h",
});

assert.deepEqual(pick(normalizeNumberUnit("265℃左右", aliases)), {
  numericText: "265",
  numberKind: "single",
  value: "265",
  unitRaw: "℃",
  unitCanonical: "℃",
  normalizedValue: "265 ℃",
});

assert.deepEqual(pick(normalizeNumberUnit("2900mm- 2400mm（单边挡250mm)", aliases)), {
  numericText: "2900-2400",
  numberKind: "range",
  rangeStart: "2900",
  rangeEnd: "2400",
  rangeMin: "2400",
  rangeMax: "2900",
  unitRaw: "mm",
  unitCanonical: "mm",
  trailingText: "单边挡250mm",
  trailingFieldName: "单边挡",
  trailingRawValue: "250mm",
  normalizedValue: "2900-2400 mm",
});

assert.deepEqual(pick(normalizeNumberUnit("0.4-1mm，最终制品厚度由需方工艺决定", aliases)), {
  numericText: "0.4-1",
  numberKind: "range",
  rangeStart: "0.4",
  rangeEnd: "1",
  rangeMin: "0.4",
  rangeMax: "1",
  unitRaw: "mm",
  unitCanonical: "mm",
  trailingText: "最终制品厚度由需方工艺决定",
  normalizedValue: "0.4-1 mm",
});

assert.deepEqual(pick(normalizeNumberUnit("0.4-5mm，开口1-6mm", aliases)), {
  numericText: "0.4-5",
  numberKind: "range",
  rangeStart: "0.4",
  rangeEnd: "5",
  rangeMin: "0.4",
  rangeMax: "5",
  unitRaw: "mm",
  unitCanonical: "mm",
  trailingText: "开口1-6mm",
  trailingFieldName: "开口",
  trailingRawValue: "1-6mm",
  normalizedValue: "0.4-5 mm",
});

const malformed = normalizeNumberUnit("0.010-0.0.04mm", aliases);
assert.equal(malformed.numberKind, "none");
assert.ok(malformed.warnings.includes("number_unit_parse_failed"));

const textOnly = normalizeNumberUnit("按客户要求", aliases);
assert.equal(textOnly.numberKind, "none");
assert.equal(textOnly.normalizedValue, "按客户要求");

function pick(result: ReturnType<typeof normalizeNumberUnit>) {
  return Object.fromEntries(Object.entries({
    numericText: result.numericText,
    numberKind: result.numberKind,
    value: result.value,
    rangeStart: result.rangeStart,
    rangeEnd: result.rangeEnd,
    rangeMin: result.rangeMin,
    rangeMax: result.rangeMax,
    unitRaw: result.unitRaw,
    unitCanonical: result.unitCanonical,
    trailingText: result.trailingText,
    trailingFieldName: result.trailingFieldName,
    trailingRawValue: result.trailingRawValue,
    normalizedValue: result.normalizedValue,
  }).filter(([, value]) => value !== undefined));
}

console.log("productConfigAgent number unit tests passed");
