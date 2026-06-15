import AdmZip from "adm-zip";
import XLSX from "xlsx";
import convert from "xml-js";
import {
  parseOptionsFromText,
  ParsedOption,
} from "./parseOptions.js";

export type TextboxBlock = {
  block_id: string;
  type: "paragraph";
  text: string;
  raw_text: string;
  options: ParsedOption[];
  source: {
    sheet_name: "UNKNOWN_NEED_REL_MAPPING";
    kind: "textbox";
    drawing: string;
    anchor: {
      from: string | null;
      to: string | null;
    };
  };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectTexts(node: any, texts: string[] = []) {
  if (!node || typeof node !== "object") return texts;

  for (const [key, value] of Object.entries(node)) {
    if ((key === "a:t" || key === "t") && typeof (value as any)?._text === "string") {
      texts.push((value as any)._text);
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectTexts(item, texts));
    } else if (value && typeof value === "object") {
      collectTexts(value, texts);
    }
  }

  return texts;
}

function findFirstByKey(node: any, keyName: string): any | null {
  if (!node || typeof node !== "object") return null;

  for (const [key, value] of Object.entries(node)) {
    if (key === keyName) return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstByKey(item, keyName);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findFirstByKey(value, keyName);
      if (found) return found;
    }
  }

  return null;
}

function anchorPointToCell(point: any) {
  const col = Number(point?.["xdr:col"]?._text ?? point?.col?._text);
  const row = Number(point?.["xdr:row"]?._text ?? point?.row?._text);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;

  return XLSX.utils.encode_cell({ r: row, c: col });
}

function parseAnchor(shapeNode: any) {
  const from = findFirstByKey(shapeNode, "xdr:from") || findFirstByKey(shapeNode, "from");
  const to = findFirstByKey(shapeNode, "xdr:to") || findFirstByKey(shapeNode, "to");

  return {
    from: anchorPointToCell(from),
    to: anchorPointToCell(to),
  };
}

function collectShapeNodes(node: any): any[] {
  if (!node || typeof node !== "object") return [];

  if ((node as any)["xdr:txBody"] || (node as any).txBody) {
    return [node];
  }

  const nodes: any[] = [];
  nodes.push(...asArray((node as any)["xdr:sp"]));
  nodes.push(...asArray((node as any).sp));

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => nodes.push(...collectShapeNodes(item)));
    } else if (value && typeof value === "object") {
      nodes.push(...collectShapeNodes(value));
    }
  }

  return nodes;
}

export async function parseTextboxes(filePath: string): Promise<TextboxBlock[]> {
  const blocks: TextboxBlock[] = [];

  try {
    const zip = new AdmZip(filePath);
    const drawingEntries = zip
      .getEntries()
      .filter(
        (entry) =>
          !entry.isDirectory &&
          /^xl\/drawings\/drawing\d+\.xml$/i.test(entry.entryName)
      );

    let textboxIndex = 1;
    for (const entry of drawingEntries) {
      const xml = entry.getData().toString("utf8");
      const parsed = convert.xml2js(xml, { compact: true }) as any;
      const shapeNodes = collectShapeNodes(parsed);

      for (const shapeNode of shapeNodes) {
        const rawText = collectTexts(shapeNode).join("").trim();
        if (!rawText) continue;

        const optionResult = parseOptionsFromText(rawText);
        blocks.push({
          block_id: `textbox_${textboxIndex++}`,
          type: "paragraph",
          text: optionResult.normalizedText,
          raw_text: rawText,
          options: optionResult.options,
          source: {
            sheet_name: "UNKNOWN_NEED_REL_MAPPING",
            kind: "textbox",
            drawing: entry.entryName,
            // TODO: map drawing rels back to worksheet names and exact anchors.
            anchor: parseAnchor(shapeNode),
          },
        });
      }
    }
  } catch (error: any) {
    console.warn("Parse xlsx textboxes failed:", error?.message || error);
  }

  return blocks;
}
