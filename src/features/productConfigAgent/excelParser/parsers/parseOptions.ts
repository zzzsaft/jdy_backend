const SELECTED_MARKS = "■☑☒●◉▣◆√✓✔";
const UNSELECTED_MARKS = "□☐○◯◻◇▢";

export type ParsedOption = {
  selected: boolean;
  label: string;
  value: string;
  normalized: string;
};

export type ParsedOptionsResult = {
  hasOptions: boolean;
  options: ParsedOption[];
  normalizedText: string;
};

const selectedMarkRegExp = new RegExp(`[${SELECTED_MARKS}]`, "g");
const unselectedMarkRegExp = new RegExp(`[${UNSELECTED_MARKS}]`, "g");

function trimOptionLabel(label: string) {
  return label
    .replace(/^[\s:：,，;；、\-]+/, "")
    .replace(/[\s,，;；、]+$/, "")
    .trim();
}

function extractOptionLabel(segment: string) {
  const withoutPrefix = segment.replace(/^[\s:：,，;；、\-]+/, "");
  const lineBreakStop = withoutPrefix.search(/\r?\n/);
  const lineText =
    lineBreakStop >= 0 ? withoutPrefix.slice(0, lineBreakStop) : withoutPrefix;

  return trimOptionLabel(removeTrailingNextOptionContext(lineText));
}

function removeTrailingNextOptionContext(label: string) {
  const whitespaceRunRegExp = /[ \t\u3000]{2,}/g;
  let match: RegExpExecArray | null;

  while ((match = whitespaceRunRegExp.exec(label))) {
    if (isInsideBrackets(label, match.index)) continue;

    const head = label.slice(0, match.index);
    const tail = label.slice(match.index + match[0].length);
    if (!trimOptionLabel(head) || !looksLikeNextOptionContext(tail)) continue;

    return head;
  }

  return label;
}

function looksLikeNextOptionContext(text: string) {
  const compact = trimOptionLabel(text).replace(/\s+/g, "");
  if (!compact) return false;
  if (compact.length > 16) return false;
  if (/[：:；;，,、]/.test(compact)) return false;

  return /^[\u4e00-\u9fa5A-Za-z0-9（）()]+$/.test(compact);
}

function isInsideBrackets(text: string, index: number) {
  const before = text.slice(0, index);
  const lastOpen = Math.max(before.lastIndexOf("（"), before.lastIndexOf("("));
  const lastClose = Math.max(before.lastIndexOf("）"), before.lastIndexOf(")"));

  return lastOpen > lastClose;
}

function replaceWhitespaceRunsOutsideBrackets(text: string, replacement: string) {
  let result = "";
  let index = 0;
  let bracketDepth = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === "（" || char === "(") {
      bracketDepth++;
      result += char;
      index++;
      continue;
    }

    if (char === "）" || char === ")") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      result += char;
      index++;
      continue;
    }

    if (bracketDepth === 0 && /[ \t]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[ \t]/.test(text[end])) end++;
      const run = text.slice(index, end);
      const next = text[end];
      result += run.length >= 2 && next && !/\s/.test(next) ? replacement : run;
      index = end;
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

export function normalizeOptionMarksInline(text: string) {
  if (!text) return "";

  return String(text)
    .replace(
      new RegExp(`[\\[\\(（]\\s*([${SELECTED_MARKS}])\\s*[\\]\\)）]`, "g"),
      "[SEL]"
    )
    .replace(
      new RegExp(`[\\[\\(（]\\s*([${UNSELECTED_MARKS}])\\s*[\\]\\)）]`, "g"),
      "[ ]"
    )
    .replace(selectedMarkRegExp, "[SEL]")
    .replace(unselectedMarkRegExp, "[ ]");
}

export function makeLlmFriendlyText(text: string) {
  if (!text) return "";

  const normalized = normalizeOptionMarksInline(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\[(SEL| )\]\s*/g, (token) => `${token.trim()} `)
    .replace(/[ \t]+(?=\[(?:SEL| )\])/g, "\n")
    .replace(/([^\n])(\[(?:SEL| )\])/g, "$1\n$2");

  return replaceWhitespaceRunsOutsideBrackets(normalized, "\n")
    .replace(/([^\n\s])[ \t]{2,}([^\s：:]{1,18}[：:])/g, "$1\n$2")
    .replace(/[ \t\u3000]*\n[ \t\u3000]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseOptionsFromText(text: string): ParsedOptionsResult {
  const normalizedInline = normalizeOptionMarksInline(text);
  const options: ParsedOption[] = [];
  const tokenRegExp = /\[(SEL| )\]/g;
  const matches = Array.from(normalizedInline.matchAll(tokenRegExp));

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const token = match[0];
    const segmentStart = (match.index || 0) + token.length;
    const segmentEnd = nextMatch?.index ?? normalizedInline.length;
    const label = extractOptionLabel(
      normalizedInline.slice(segmentStart, segmentEnd)
    );

    if (!label) continue;

    const selected = token === "[SEL]";
    options.push({
      selected,
      label,
      value: label,
      normalized: `${selected ? "[SEL]" : "[ ]"} ${label}`,
    });
  }

  return {
    hasOptions: options.length > 0,
    options,
    normalizedText: makeLlmFriendlyText(text),
  };
}
