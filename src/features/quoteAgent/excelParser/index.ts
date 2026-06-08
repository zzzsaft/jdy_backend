import { parseExcelFromLocalFile } from "./parseExcelFromLocalFile";
import { parseExcelFromUrl } from "./parseExcelFromUrl";
import { ExcelParserOptions } from "./parsers/parseWorkbook";

function isHttpUrl(input: string) {
  return /^https?:\/\//i.test(input);
}

export async function parseExcel(input: string, options: ExcelParserOptions = {}) {
  return isHttpUrl(input)
    ? parseExcelFromUrl(input, options)
    : parseExcelFromLocalFile(input, options);
}

export { parseExcelFromLocalFile, parseExcelFromUrl };
export { parseOptionsFromText } from "./parsers/parseOptions";
export { buildLlmText } from "./services/buildLlmText";
export type { BuildLlmTextOptions } from "./services/buildLlmText";
export type { ExcelParserOptions, ExcelBlock } from "./parsers/parseWorkbook";
