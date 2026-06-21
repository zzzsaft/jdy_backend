import assert from "node:assert/strict";
import {
  buildBatchItemExtractSystemPrompt,
  buildItemExtractSystemPrompt,
  buildItemInputText,
} from "./twoStageExtract.js";

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

for (const prompt of [
  buildItemExtractSystemPrompt("flat_die"),
  buildBatchItemExtractSystemPrompt("flat_die"),
]) {
  assert.match(prompt, /split_fields 必须覆盖所有有业务意义的片段/);
  assert.match(prompt, /塑料原料.*只能放材料牌号\/材料名称本身/);
  assert.match(prompt, /不得在 split_fields 中再次输出完整混填串/);
  assert.match(prompt, /产品\/部位词不得并入应用类型/);
  assert.match(prompt, /split_fields 自身也必须是单一业务属性/);
  assert.match(prompt, /PE\+CaCo3透气膜.*原料配方.*应用类型/);
  assert.match(prompt, /两侧板加热.*qualifier\.area="side_plate"/);
  assert.match(prompt, /A\/B\/C\/D 主机.*挤出机型号.*qualifier\.layer/);
  assert.match(prompt, /测温点距内表面6mm.*field_name="测温点距内表面"/);
  assert.match(prompt, /按原图纸.*190590.*参考产品编号/);
  assert.match(prompt, /光学级、弹性体、交联化学发泡/);
  assert.match(prompt, /BOPET、BOPE允许作为塑料原料/);
}

console.log("productConfigAgent two-stage extraction tests passed");
