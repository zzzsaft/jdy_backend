import { ExcelParserOptions } from "./parsers/parseWorkbook";
import { parseExcelFile } from "./services/excelParserService";

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
