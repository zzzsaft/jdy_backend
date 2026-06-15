import assert from "node:assert/strict";
import { normalizeNumberUnit, normalizeUnitAliasText } from "./numberUnit.js";

const aliases = new Map([
  ["mm", { id: "1", canonicalUnit: "mm", displayUnit: "mm" }],
  ["公斤/h", { id: "2", canonicalUnit: "kg/h", displayUnit: "kg/h" }],
  ["kg/h", { id: "3", canonicalUnit: "kg/h", displayUnit: "kg/h" }],
]);

assert.equal(normalizeUnitAliasText("cm³/rev"), "cm3/rev");

assert.deepEqual(
  pick(normalizeNumberUnit("1900MM", aliases)),
  {
    numericText: "1900",
    numberKind: "single",
    value: "1900",
    unitRaw: "MM",
    unitCanonical: "mm",
    normalizedValue: "1900 mm",
  },
);

assert.deepEqual(
  pick(normalizeNumberUnit("20 公斤/H", aliases)),
  {
    numericText: "20",
    numberKind: "single",
    value: "20",
    unitRaw: "公斤/H",
    unitCanonical: "kg/h",
    normalizedValue: "20 kg/h",
  },
);

assert.deepEqual(
  pick(normalizeNumberUnit("2000～3000 mm", aliases)),
  {
    numericText: "2000-3000",
    numberKind: "range",
    rangeStart: "2000",
    rangeEnd: "3000",
    rangeMin: "2000",
    rangeMax: "3000",
    unitRaw: "mm",
    unitCanonical: "mm",
    normalizedValue: "2000-3000 mm",
  },
);

assert.deepEqual(
  pick(normalizeNumberUnit("3000-2000 kg/h", aliases)),
  {
    numericText: "3000-2000",
    numberKind: "range",
    rangeStart: "3000",
    rangeEnd: "2000",
    rangeMin: "2000",
    rangeMax: "3000",
    unitRaw: "kg/h",
    unitCanonical: "kg/h",
    normalizedValue: "3000-2000 kg/h",
  },
);

assert.deepEqual(
  pick(normalizeNumberUnit("300～200毫米", aliases)),
  {
    numericText: "300-200",
    numberKind: "range",
    rangeStart: "300",
    rangeEnd: "200",
    rangeMin: "200",
    rangeMax: "300",
    unitRaw: "毫米",
    normalizedValue: "300-200 毫米",
  },
);
assert.ok(
  normalizeNumberUnit("300～200毫米", aliases).warnings.includes(
    "unit_alias_no_match",
  ),
);

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
    normalizedValue: result.normalizedValue,
  }).filter(([, value]) => value !== undefined));
}

console.log("productConfigAgent number unit tests passed");
