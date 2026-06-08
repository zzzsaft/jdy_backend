import { ExcelParserOptions } from "./parsers/parseWorkbook";
import { downloadExcelFile } from "./services/fileDownloadService";
import { parseExcelFile } from "./services/excelParserService";
import { ExcelParserError, safeRemoveDir } from "../../../utils/excelFileUtils";

function isHttpUrl(input: string) {
  return /^https?:\/\//i.test(input);
}

export async function parseExcelFromUrl(
  url: string,
  options: ExcelParserOptions = {}
) {
  if (!isHttpUrl(url)) {
    return {
      success: false as const,
      error: {
        code: "INVALID_EXCEL_URL",
        message: "请输入 http:// 或 https:// 开头的 Excel 文件链接",
      },
    };
  }

  let downloaded:
    | Awaited<ReturnType<typeof downloadExcelFile>>
    | null = null;

  try {
    downloaded = await downloadExcelFile(url);
    return await parseExcelFile({
      filePath: downloaded.filePath,
      sourceType: "url",
      options,
      tempDir: downloaded.tempDir,
      fileName: downloaded.fileName,
    });
  } catch (error: any) {
    if (downloaded && !options.keepTempFile) {
      await safeRemoveDir(downloaded.tempDir);
    }

    if (error instanceof ExcelParserError) {
      return {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }

    console.error("Parse excel from url failed:", error?.message || error);
    return {
      success: false as const,
      error: {
        code: "EXCEL_DOWNLOAD_FAILED",
        message: "Excel 文件下载失败",
      },
    };
  }
}
