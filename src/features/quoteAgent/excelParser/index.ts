import { parseExcelFromLocalFile } from "./parseExcelFromLocalFile.js";
import { parseExcelFromUrl } from "./parseExcelFromUrl.js";
import { ExcelParserOptions } from "./parsers/parseWorkbook.js";

function isHttpUrl(input: string) {
  return /^https?:\/\//i.test(input);
}

export async function parseExcel(input: string, options: ExcelParserOptions = {}) {
  return isHttpUrl(input)
    ? parseExcelFromUrl(input, options)
    : parseExcelFromLocalFile(input, options);
}

export { parseExcelFromLocalFile, parseExcelFromUrl };
export { parseOptionsFromText } from "./parsers/parseOptions.js";
export { buildLlmText } from "./services/buildLlmText.js";
export type { BuildLlmTextOptions } from "./services/buildLlmText.js";
export type { ExcelParserOptions, ExcelBlock } from "./parsers/parseWorkbook.js";
