import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type ExcelFileType = "xlsx" | "xls";

export class ExcelParserError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function getExcelFileType(filePath: string): ExcelFileType | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".xls") return "xls";
  return null;
}

export async function createExcelTempDir() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "quote-excel-"));
}

export async function safeRemoveFile(filePath?: string | null) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Remove temp excel file failed:", error?.message || error);
    }
  }
}

export async function safeRemoveDir(dirPath?: string | null) {
  if (!dirPath) return;
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch (error: any) {
    console.warn("Remove temp excel dir failed:", error?.message || error);
  }
}

export async function ensureXlsxFile(filePath: string, tempDir: string) {
  const fileType = getExcelFileType(filePath);
  if (!fileType) {
    throw new ExcelParserError(
      "UNSUPPORTED_EXCEL_FILE",
      "仅支持 .xls 或 .xlsx 文件"
    );
  }

  if (fileType === "xlsx") return filePath;

  return convertXlsToXlsx(filePath, tempDir);
}

export async function convertXlsToXlsx(filePath: string, tempDir: string) {
  try {
    await execFileAsync("soffice", ["--version"]);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new ExcelParserError(
        "LIBREOFFICE_NOT_INSTALLED",
        ".xls 文件解析需要安装 LibreOffice，并确保 soffice 可执行文件在 PATH 中"
      );
    }

    throw new ExcelParserError(
      "LIBREOFFICE_CHECK_FAILED",
      "LibreOffice 可用性检查失败，无法转换 .xls 文件"
    );
  }

  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "xlsx",
      "--outdir",
      tempDir,
      filePath,
    ]);
  } catch (error: any) {
    console.error("Convert .xls to .xlsx failed:", error?.message || error);
    throw new ExcelParserError("XLS_CONVERT_FAILED", ".xls 转换为 .xlsx 失败");
  }

  const convertedPath = path.join(
    tempDir,
    `${path.basename(filePath, path.extname(filePath))}.xlsx`
  );

  if (!fs.existsSync(convertedPath)) {
    throw new ExcelParserError(
      "XLS_CONVERT_FAILED",
      ".xls 转换完成后未找到输出的 .xlsx 文件"
    );
  }

  return convertedPath;
}
