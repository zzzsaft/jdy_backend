import assert from "node:assert/strict";
import { buildLlmText } from "../src/features/productConfigAgent/excelParser/services/buildLlmText.js";
import { parseOptionsFromText } from "../src/features/productConfigAgent/excelParser/parsers/parseOptions.js";
import type { ExcelBlock } from "../src/features/productConfigAgent/excelParser/parsers/parseWorkbook.js";

const optionSample =
  "产品材质：[ ]A 1.2714A [SEL]B 1.2311A";

const parsedOptions = parseOptionsFromText(optionSample);
assert.equal(parsedOptions.options.length, 2);
assert.equal(parsedOptions.options[0].value, "A 1.2714A");
assert.equal(parsedOptions.options[0].selected, false);
assert.equal(parsedOptions.options[1].selected, true);
assert.equal(parsedOptions.options[1].value, "B 1.2311A");

const mixedOptionSample = "选材：□A 1.234■B 1.271";
const mixedOptions = parseOptionsFromText(mixedOptionSample);
assert.equal(mixedOptions.options.length, 2);
assert.equal(mixedOptions.options[0].value, "A 1.234");
assert.equal(mixedOptions.options[0].selected, false);
assert.equal(mixedOptions.options[1].value, "B 1.271");
assert.equal(mixedOptions.options[1].selected, true);

const blocks = [
  {
    block_id: "cell_A1",
    type: "cell",
    text: optionSample,
    raw_text: optionSample,
    options: parsedOptions.options,
    source: {
      sheet_name: "S1",
      kind: "cell",
      cell: "A1",
      row: 1,
      col: 1,
      sheet_range: null,
      merge_range: null,
    },
  },
  {
    block_id: "cell_A2",
    type: "cell",
    text: "■产品",
    raw_text: "■产品",
    options: [],
    source: {
      sheet_name: "S1",
      kind: "cell",
      cell: "A2",
      row: 2,
      col: 1,
      sheet_range: null,
      merge_range: null,
    },
  },
] satisfies ExcelBlock[];

const llmText = buildLlmText({ blocks }, { mode: "cell", includeFileMeta: false, includeSheetName: false });
assert.ok(llmText.includes("option_set"));
assert.ok(llmText.includes('"field":"产品材质"'));
assert.ok(llmText.includes('"selected":true'));
assert.ok(llmText.includes('"value":"B 1.2311A"'));

const noFieldBlock = {
  block_id: "cell_B1",
  type: "cell",
  text: "[SEL]B 1.2311A",
  raw_text: "[SEL]B 1.2311A",
  options: [
    {
      label: "B 1.2311A",
      selected: true,
      value: "B 1.2311A",
      normalized: "[SEL] B 1.2311A",
    },
  ],
  source: {
    sheet_name: "S1",
    kind: "cell",
    cell: "B1",
    row: 3,
    col: 2,
    sheet_range: null,
    merge_range: null,
  },
} satisfies ExcelBlock;
const llmTextNoField = buildLlmText({ blocks: [noFieldBlock] }, {
  mode: "cell",
  includeFileMeta: false,
  includeSheetName: false,
});
assert.ok(llmTextNoField.includes("option_set"));
assert.ok(llmTextNoField.includes('"selected":true'));
