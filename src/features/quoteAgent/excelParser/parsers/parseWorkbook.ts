import * as XLSX from "xlsx";
import path from "path";
import {
  makeLlmFriendlyText,
  parseOptionsFromText,
  ParsedOption,
} from "./parseOptions";
import { parseTextboxes, TextboxBlock } from "./parseTextboxes";
import { ExcelParserError } from "../../../../utils/excelFileUtils";
import type { BuildLlmTextOptions } from "../services/buildLlmText";

export type ExcelParserOptions = {
  parseTextboxes?: boolean;
  keepTempFile?: boolean;
  includeRowBlocks?: boolean;
  xlsMode?: "direct-first" | "direct" | "convert";
  buildLlmText?: boolean;
  llmTextOptions?: BuildLlmTextOptions;
};

export type CellBlock = {
  block_id: string;
  type: "cell";
  text: string;
  raw_text: string;
  options: ParsedOption[];
  source: {
    sheet_name: string;
    kind: "cell";
    cell: string;
    row: number;
    col: number;
    sheet_range: string | null;
    merge_range: string | null;
  };
};

export type RowBlock = {
  block_id: string;
  type: "row";
  content: {
    text: string;
    cells: {
      source: string;
      text: string;
      raw_text: string;
      options: ParsedOption[];
    }[];
  };
  source: {
    sheet_name: string;
    kind: "row";
    range: string;
    cells: string[];
  };
};

export type ExcelBlock = CellBlock | RowBlock | TextboxBlock;

function safeSheetNameForId(sheetName: string) {
  return sheetName.replace(/[^\w\u4e00-\u9fa5]+/g, "_") || "Sheet";
}

function cellText(cell: XLSX.CellObject) {
  const formatted = XLSX.utils.format_cell(cell);
  const value = formatted || cell.w || cell.v;
  return value === undefined || value === null ? "" : String(value).trim();
}

function mergeRangeForCell(
  merges: XLSX.Range[] | undefined,
  rowIndex: number,
  colIndex: number
) {
  if (!merges?.length) return null;

  const merge = merges.find(
    (item) =>
      rowIndex >= item.s.r &&
      rowIndex <= item.e.r &&
      colIndex >= item.s.c &&
      colIndex <= item.e.c
  );

  return merge ? XLSX.utils.encode_range(merge) : null;
}

function makeCellBlock(params: {
  sheetName: string;
  sheetRange: string | null;
  cellAddress: string;
  rowIndex: number;
  colIndex: number;
  rawText: string;
  mergeRange: string | null;
}): CellBlock {
  const optionResult = parseOptionsFromText(params.rawText);
  const safeSheetName = safeSheetNameForId(params.sheetName);

  return {
    block_id: `${safeSheetName}_${params.cellAddress}`,
    type: "cell",
    text: optionResult.hasOptions
      ? optionResult.normalizedText
      : makeLlmFriendlyText(params.rawText),
    raw_text: params.rawText,
    options: optionResult.options,
    source: {
      sheet_name: params.sheetName,
      kind: "cell",
      cell: params.cellAddress,
      row: params.rowIndex + 1,
      col: params.colIndex + 1,
      sheet_range: params.sheetRange,
      merge_range: params.mergeRange,
    },
  };
}

function makeRowBlocks(sheetName: string, cellBlocks: CellBlock[]) {
  const byRow = new Map<number, CellBlock[]>();

  for (const block of cellBlocks) {
    const rowBlocks = byRow.get(block.source.row) || [];
    rowBlocks.push(block);
    byRow.set(block.source.row, rowBlocks);
  }

  return Array.from(byRow.entries()).map(([row, blocks]) => {
    const orderedBlocks = blocks.sort((a, b) => a.source.col - b.source.col);
    const cells = orderedBlocks.map((block) => block.source.cell);

    return {
      block_id: `${safeSheetNameForId(sheetName)}_R${row}`,
      type: "row" as const,
      content: {
        text: orderedBlocks.map((block) => block.text).join("\n"),
        cells: orderedBlocks.map((block) => ({
          source: block.source.cell,
          text: block.text,
          raw_text: block.raw_text,
          options: block.options,
        })),
      },
      source: {
        sheet_name: sheetName,
        kind: "row" as const,
        range:
          cells.length === 1
            ? cells[0]
            : `${cells[0]}:${cells[cells.length - 1]}`,
        cells,
      },
    };
  });
}

export async function parseWorkbook(
  filePath: string,
  options: ExcelParserOptions = {}
): Promise<ExcelBlock[]> {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (error: any) {
    console.error("Excel workbook parse failed:", error?.message || error);
    throw new ExcelParserError("EXCEL_PARSE_FAILED", "Excel 解析失败");
  }

  if (!workbook.SheetNames?.length) {
    throw new ExcelParserError("EMPTY_WORKBOOK", "Excel 工作簿为空");
  }

  const blocks: ExcelBlock[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRange = sheet?.["!ref"] || null;
    if (!sheet || !sheetRange) continue;

    const range = XLSX.utils.decode_range(sheetRange);
    const sheetCellBlocks: CellBlock[] = [];

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
        const cellAddress = XLSX.utils.encode_cell({
          r: rowIndex,
          c: colIndex,
        });
        const cell = sheet[cellAddress];
        if (!cell) continue;

        const rawText = cellText(cell);
        if (!rawText) continue;

        const block = makeCellBlock({
          sheetName,
          sheetRange,
          cellAddress,
          rowIndex,
          colIndex,
          rawText,
          mergeRange: mergeRangeForCell(sheet["!merges"], rowIndex, colIndex),
        });

        sheetCellBlocks.push(block);
        blocks.push(block);
      }
    }

    if (options.includeRowBlocks && sheetCellBlocks.length > 0) {
      blocks.push(...makeRowBlocks(sheetName, sheetCellBlocks));
    }
  }

  if (options.parseTextboxes !== false && path.extname(filePath).toLowerCase() === ".xlsx") {
    blocks.push(...(await parseTextboxes(filePath)));
  }

  if (!blocks.length) {
    throw new ExcelParserError("EMPTY_EXCEL_CONTENT", "Excel 未解析到有效文本内容");
  }

  return blocks;
}
