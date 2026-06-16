import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { parseExcelFile } from "../src/features/productConfigAgent/excelParser/services/excelParserService.js";
import { parseWorkbook } from "../src/features/productConfigAgent/excelParser/parsers/parseWorkbook.js";
import { sanitizeExcelText } from "../src/features/productConfigAgent/excelParser/parsers/sanitizeText.js";

function hasNul(value: unknown): boolean {
  if (typeof value === "string") return value.includes(String.fromCharCode(0));
  if (Array.isArray(value)) return value.some(hasNul);
  if (value && typeof value === "object") {
    return Object.values(value).some(hasNul);
  }

  return false;
}

assert.equal(
  sanitizeExcelText(`before${String.fromCharCode(0)}after`),
  "beforeafter",
);
assert.equal(sanitizeExcelText(null), "");
assert.equal(sanitizeExcelText(`乱码${String.fromCharCode(0x0085)}ÃÂ`), "");
assert.equal(
  sanitizeExcelText(
    `binary${String.fromCharCode(0x000e)}${String.fromCharCode(0x001f)}text`,
  ),
  "",
);
assert.equal(
  sanitizeExcelText(`保留\n换行\t制表${String.fromCharCode(0x000e)}`),
  "保留\n换行\t制表",
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quote-agent-test-"));
const filePath = path.join(tempDir, "nul-text.xlsx");

try {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [`产品${String.fromCharCode(0)}名称`, "保留\n换行\t制表"],
    [
      `乱码${String.fromCharCode(0x0085)}ÃÂ`,
      `binary${String.fromCharCode(0x000e)}${String.fromCharCode(0x001f)}text`,
    ],
  ]);
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    `Sheet${String.fromCharCode(0)}1`,
  );
  XLSX.writeFile(workbook, filePath);

  const blocks = await parseWorkbook(filePath, { parseTextboxes: false });
  const parsed = await parseExcelFile({
    filePath,
    sourceType: "local",
    fileName: `file${String.fromCharCode(0)}name.xlsx`,
    options: { parseTextboxes: false },
    tempDir: path.join(tempDir, "parser-temp"),
  });

  assert.equal(hasNul(blocks), false);
  assert.equal(parsed.success, true);
  assert.equal(hasNul(parsed), false);
  assert.ok(
    blocks.some(
      (block) => block.type === "cell" && block.raw_text === "产品名称",
    ),
  );
  assert.equal(
    blocks.some(
      (block) =>
        block.type === "cell" &&
        /乱码|binary|ÃÂ|[\u0080-\u009f]/.test(block.raw_text),
    ),
    false,
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("productConfigAgent excel parser sanitize tests passed");
