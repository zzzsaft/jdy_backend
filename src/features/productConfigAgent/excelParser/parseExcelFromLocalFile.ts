import { ExcelParserOptions } from "./parsers/parseWorkbook.js";
import { parseExcelFile } from "./services/excelParserService.js";

export async function parseExcelFromLocalFile(
  filePath: string,
  options: ExcelParserOptions = {}
) {
  return parseExcelFile({
    filePath,
    sourceType: "local",
    options,
  });
}
