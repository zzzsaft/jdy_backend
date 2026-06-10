import fs from "fs";
import path from "path";
import {
  convertXlsToXlsx,
  createExcelTempDir,
  ExcelParserError,
  getExcelFileType,
  safeRemoveDir,
} from "../../../../utils/excelFileUtils.js";
import {
  ExcelBlock,
  ExcelParserOptions,
  parseWorkbook,
} from "../parsers/parseWorkbook.js";
import { buildLlmText as buildLlmTextFromResult } from "./buildLlmText.js";

export type ExcelSourceType = "url" | "local";

export type ExcelParseSuccess = {
  success: true;
  data: {
    file_name: string;
    source_type: ExcelSourceType;
    blocks: ExcelBlock[];
    llm_text?: string;
  };
};

export type ExcelParseFailure = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ExcelParseResult = ExcelParseSuccess | ExcelParseFailure;

export const defaultExcelParserOptions: Required<ExcelParserOptions> = {
  parseTextboxes: true,
  keepTempFile: false,
  includeRowBlocks: false,
  xlsMode: "direct-first",
  buildLlmText: true,
  llmTextOptions: {},
};

function toFailure(error: any): ExcelParseFailure {
  if (error instanceof ExcelParserError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  console.error("Excel parser unexpected error:", error?.message || error);
  return {
    success: false,
    error: {
      code: "EXCEL_PARSE_FAILED",
      message: "Excel 解析失败",
    },
  };
}

async function parseByMode(params: {
  filePath: string;
  fileType: "xlsx" | "xls";
  tempDir: string;
  options: Required<ExcelParserOptions>;
}) {
  if (params.fileType === "xlsx") {
    return parseWorkbook(params.filePath, params.options);
  }

  if (params.options.xlsMode === "direct") {
    return parseWorkbook(params.filePath, params.options);
  }

  if (params.options.xlsMode === "convert") {
    const convertedPath = await convertXlsToXlsx(params.filePath, params.tempDir);
    return parseWorkbook(convertedPath, params.options);
  }

  try {
    return await parseWorkbook(params.filePath, params.options);
  } catch (error: any) {
    console.warn(
      "Direct .xls parse failed, fallback to LibreOffice conversion:",
      error?.message || error
    );
    const convertedPath = await convertXlsToXlsx(params.filePath, params.tempDir);
    return parseWorkbook(convertedPath, params.options);
  }
}

export async function parseExcelFile(params: {
  filePath: string;
  sourceType: ExcelSourceType;
  options?: ExcelParserOptions;
  tempDir?: string;
  fileName?: string;
}): Promise<ExcelParseResult> {
  const parserOptions = {
    ...defaultExcelParserOptions,
    ...(params.options || {}),
  };
  const workingTempDir = params.tempDir || (await createExcelTempDir());

  try {
    if (!fs.existsSync(params.filePath)) {
      throw new ExcelParserError("FILE_NOT_FOUND", "Excel 文件不存在");
    }

    const fileType = getExcelFileType(params.filePath);
    if (!fileType) {
      throw new ExcelParserError(
        "UNSUPPORTED_EXCEL_FILE",
        "仅支持 .xls 或 .xlsx 文件"
      );
    }

    const blocks = await parseByMode({
      filePath: params.filePath,
      fileType,
      tempDir: workingTempDir,
      options: parserOptions,
    });

    const data: ExcelParseSuccess["data"] = {
      file_name: params.fileName || path.basename(params.filePath),
      source_type: params.sourceType,
      blocks,
    };

    if (parserOptions.buildLlmText) {
      data.llm_text = buildLlmTextFromResult(data, parserOptions.llmTextOptions);
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    return toFailure(error);
  } finally {
    if (!parserOptions.keepTempFile) {
      await safeRemoveDir(workingTempDir);
    }
  }
}
