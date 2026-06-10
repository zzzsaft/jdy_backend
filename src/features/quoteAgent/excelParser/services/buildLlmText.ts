import type { ExcelBlock } from "../parsers/parseWorkbook.js";
import * as XLSX from "xlsx";

export type BuildLlmTextOptions = {
  mode?: "row" | "cell";
  includeInstruction?: boolean;
  includeFileMeta?: boolean;
  includeSheetName?: boolean;
  includeEmptyCells?: boolean;
  includeMergeContext?: boolean;
  skipHeaderLikeRows?: boolean;
};

type ParsedExcelData = {
  file_name?: string;
  source_type?: string;
  blocks?: ExcelBlock[];
};

const defaultBuildLlmTextOptions: Required<BuildLlmTextOptions> = {
  mode: "row",
  includeInstruction: true,
  includeFileMeta: true,
  includeSheetName: true,
  includeEmptyCells: false,
  includeMergeContext: true,
  skipHeaderLikeRows: true,
};

function getData(parsedResult: ParsedExcelData | { data?: ParsedExcelData }) {
  return "data" in parsedResult && parsedResult.data
    ? parsedResult.data
    : (parsedResult as ParsedExcelData);
}

function isCellBlock(block: ExcelBlock): block is Extract<ExcelBlock, { type: "cell" }> {
  return block.type === "cell" && block.source?.kind === "cell";
}

function isTextboxBlock(
  block: ExcelBlock
): block is Extract<ExcelBlock, { type: "paragraph" }> {
  return block.type === "paragraph" && block.source?.kind === "textbox";
}

function pushHeader(lines: string[], data: ParsedExcelData, config: Required<BuildLlmTextOptions>) {
  if (config.includeFileMeta) {
    lines.push(`文件名：${data.file_name || ""}`);
    lines.push(`来源：${data.source_type || ""}`);
    lines.push("");
  }

  if (config.includeInstruction) {
    lines.push("说明：");
    lines.push("[SEL] 表示该选项被选中。");
    lines.push("[ ] 表示该选项未选中。");
    lines.push("请以后续结构化时只根据 [SEL] 判断最终选中项；[ ] 只作为候选项参考。");
    lines.push("空括号表示未填写。");
    lines.push("文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。");
    lines.push("");
  }
}

function pushCell(lines: string[], cell: Extract<ExcelBlock, { type: "cell" }>) {
  const text = cell.text.trim();
  const coordinate = `[${cell.source.cell}]`;
  if (text.includes("\n")) {
    lines.push(coordinate);
    lines.push(text);
    return;
  }

  lines.push(`${coordinate} ${text}`);
}

function buildMergeContextByRow(cells: Extract<ExcelBlock, { type: "cell" }>[]) {
  const contextByRow = new Map<number, string>();

  cells.forEach((cell) => {
    if (cell.source.col !== 1 || !cell.source.merge_range || !cell.text?.trim()) {
      return;
    }

    let range: XLSX.Range;
    try {
      range = XLSX.utils.decode_range(cell.source.merge_range);
    } catch {
      return;
    }

    const isAColumn = range.s.c === 0 && range.e.c === 0;
    const isVerticalMerge = range.e.r > range.s.r;
    if (!isAColumn || !isVerticalMerge) return;

    for (let row = range.s.r + 1; row <= range.e.r + 1; row++) {
      contextByRow.set(row, cell.text.trim());
    }
  });

  return contextByRow;
}

function shouldSkipHeaderLikeRow(cells: Extract<ExcelBlock, { type: "cell" }>[]) {
  const text = cells
    .map((cell) => cell.text || "")
    .join("\n")
    .trim();
  if (!text) return true;

  const hasOptions = cells.some(
    (cell) => cell.options?.length || /\[(SEL| )\]/.test(cell.text || "")
  );
  if (hasOptions) return false;

  if (/[：:]/.test(text)) return false;

  const compactText = text.replace(/\s+/g, "");
  const hasHeaderMarker =
    /生产明细表/.test(compactText) ||
    /内部使用/.test(compactText) ||
    /注意保密/.test(compactText) ||
    /^QR\d+(?:[.-]\d+)*/i.test(compactText);

  if (!hasHeaderMarker) return false;

  const businessHints = [
    "模头编号",
    "客户ID",
    "合同编号",
    "下单日期",
    "适用塑料原料",
    "制品有效",
    "模头有效",
    "模唇调节",
    "电镀",
    "进料口",
    "连接器",
  ];

  return !businessHints.some((hint) => compactText.includes(hint));
}

function groupCellsBySheet(blocks: ExcelBlock[], includeEmptyCells: boolean) {
  const sheets = new Map<string, Extract<ExcelBlock, { type: "cell" }>[]>();

  blocks
    .filter(isCellBlock)
    .filter((block) => includeEmptyCells || Boolean(block.text?.trim()))
    .forEach((block) => {
      const sheetName = block.source.sheet_name || "UNKNOWN_SHEET";
      const sheetBlocks = sheets.get(sheetName) || [];
      sheetBlocks.push(block);
      sheets.set(sheetName, sheetBlocks);
    });

  return sheets;
}

function pushRowMode(
  lines: string[],
  sheetName: string,
  cells: Extract<ExcelBlock, { type: "cell" }>[],
  config: Required<BuildLlmTextOptions>
) {
  if (config.includeSheetName) {
    lines.push(`Sheet：${sheetName}`);
    lines.push("");
  }

  const rows = new Map<number, Extract<ExcelBlock, { type: "cell" }>[]>();
  const mergeContextByRow = config.includeMergeContext
    ? buildMergeContextByRow(cells)
    : new Map<number, string>();

  cells.forEach((cell) => {
    const rowCells = rows.get(cell.source.row) || [];
    rowCells.push(cell);
    rows.set(cell.source.row, rowCells);
  });

  Array.from(rows.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([row, rowCells]) => {
      const orderedCells = rowCells.sort((a, b) => a.source.col - b.source.col);
      if (config.skipHeaderLikeRows && shouldSkipHeaderLikeRow(orderedCells)) {
        return;
      }

      lines.push(`Row ${row}:`);
      const hasAColumnText = orderedCells.some(
        (cell) => cell.source.col === 1 && cell.text?.trim()
      );
      const mergeContext = mergeContextByRow.get(row);
      if (mergeContext && !hasAColumnText) {
        lines.push(`上下文：${mergeContext}`);
      }

      orderedCells.forEach((cell) => pushCell(lines, cell));
      lines.push("");
    });
}

function pushCellMode(
  lines: string[],
  sheetName: string,
  cells: Extract<ExcelBlock, { type: "cell" }>[],
  config: Required<BuildLlmTextOptions>
) {
  if (config.includeSheetName) {
    lines.push(`Sheet：${sheetName}`);
    lines.push("");
  }

  cells
    .sort((a, b) => a.source.row - b.source.row || a.source.col - b.source.col)
    .filter((cell, _, sortedCells) => {
      if (!config.skipHeaderLikeRows) return true;
      const rowCells = sortedCells.filter(
        (item) => item.source.row === cell.source.row
      );
      return !shouldSkipHeaderLikeRow(rowCells);
    })
    .forEach((cell) => {
      pushCell(lines, cell);
      lines.push("");
    });
}

function pushTextboxes(lines: string[], blocks: ExcelBlock[]) {
  const textboxes = blocks.filter(isTextboxBlock).filter((block) => block.text?.trim());
  if (!textboxes.length) return;

  lines.push("文本框内容：");
  lines.push("");
  textboxes.forEach((block) => {
    lines.push(`[${block.block_id}]`);
    lines.push(block.text.trim());
    lines.push("");
  });
}

export function buildLlmText(
  parsedResult: ParsedExcelData | { data?: ParsedExcelData },
  options: BuildLlmTextOptions = {}
) {
  const config = {
    ...defaultBuildLlmTextOptions,
    ...options,
  };
  const data = getData(parsedResult);
  const blocks = data.blocks || [];
  const lines: string[] = [];

  pushHeader(lines, data, config);

  const sheets = groupCellsBySheet(blocks, config.includeEmptyCells);
  for (const [sheetName, cells] of sheets.entries()) {
    if (config.mode === "cell") {
      pushCellMode(lines, sheetName, cells, config);
    } else {
      pushRowMode(lines, sheetName, cells, config);
    }
  }

  pushTextboxes(lines, blocks);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
