import axios from "axios";
import fs from "fs";
import path from "path";
import { createExcelTempDir, ExcelParserError } from "../../../../utils/excelFileUtils";

function filenameFromContentDisposition(contentDisposition?: string) {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ? decodeURIComponent(plainMatch[1]) : null;
}

function filenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const basename = path.basename(decodeURIComponent(parsed.pathname));
    return basename && basename !== "/" ? basename : null;
  } catch {
    return null;
  }
}

function isExcelContentType(contentType?: string) {
  if (!contentType) return false;
  return /spreadsheet|excel|vnd\.ms-excel|officedocument/i.test(contentType);
}

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "_");
}

export async function downloadExcelFile(url: string) {
  const tempDir = await createExcelTempDir();

  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
    });

    const contentType = String(response.headers["content-type"] || "");
    const contentDisposition = String(
      response.headers["content-disposition"] || ""
    );
    const headerFileName = filenameFromContentDisposition(contentDisposition);
    const urlFileName = filenameFromUrl(url);
    let fileName = safeFileName(headerFileName || urlFileName || "download.xlsx");
    let ext = path.extname(fileName).toLowerCase();

    if (![".xlsx", ".xls"].includes(ext)) {
      if (!isExcelContentType(contentType)) {
        throw new ExcelParserError(
          "URL_NOT_EXCEL_FILE",
          "URL 返回内容不是支持的 Excel 文件"
        );
      }

      fileName = `${path.basename(fileName, ext || undefined)}.xlsx`;
      ext = ".xlsx";
    }

    const filePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(filePath, Buffer.from(response.data));

    return {
      filePath,
      tempDir,
      fileName,
    };
  } catch (error: any) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });

    if (error instanceof ExcelParserError) throw error;
    console.error("Download excel failed:", error?.message || error);
    throw new ExcelParserError("EXCEL_DOWNLOAD_FAILED", "Excel 文件下载失败");
  }
}
