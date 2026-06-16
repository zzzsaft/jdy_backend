import assert from "node:assert/strict";
import { buildItemInputText } from "./twoStageExtract.js";

const rowMappedText = [
  "File: demo.xlsx",
  "Sheet: 参数",
  "Row 35:",
  "[A35] 一、模头",
  "[A36] 模头有效宽度 2500mm",
  "Row 67:",
  "[A67] 二、分配器",
  "[A68] 分配器型号 FB-1200",
  "Row 69:",
  "[A69] 分配器层数 三层",
].join("\n");

const mappedResult = buildItemInputText(rowMappedText, {}, {
  item_index: 2,
  item_name: "分配器",
  product_type_hint: "feedblock",
  product_type_raw: "分配器",
  llm_text_ranges: [{ start_line: 67, end_line: 68 }],
});

assert.equal(mappedResult.rangeSource, "excel_row_mapped");
assert.match(mappedResult.text, /Row 67/);
assert.match(mappedResult.text, /分配器型号/);
assert.equal(mappedResult.warnings[0]?.type, "plan_range_excel_row_mapped");

const unsafeResult = buildItemInputText(rowMappedText, {}, {
  item_index: 2,
  item_name: "分配器",
  product_type_hint: "feedblock",
  product_type_raw: "分配器",
  llm_text_ranges: [{ start_line: 35, end_line: 36 }],
});

assert.equal(unsafeResult.rangeSource, "fallback");
assert.equal(
  unsafeResult.warnings[0]?.type,
  "plan_range_suspected_misaligned",
);

console.log("productConfigAgent two-stage extraction tests passed");
