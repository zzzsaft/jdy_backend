const INDEXED_INSTANCE_FIELD_PATTERN =
  /^(.+?)([1-9][0-9]*|[\uff11-\uff19][\uff10-\uff19]*|[一二三四五六七八九十百]+)$/u;

export function parseIndexedInstanceFieldName(
  fieldName: string,
): { baseFieldName: string; instanceIndex: number } | null {
  const compact = String(fieldName ?? "").replace(/\s+/g, "");
  const match = compact.match(INDEXED_INSTANCE_FIELD_PATTERN);
  if (!match) {
    return null;
  }

  const baseFieldName = match[1];
  if (!baseFieldName.trim()) {
    return null;
  }

  const instanceIndex = parseInstanceIndex(match[2]);
  if (!Number.isFinite(instanceIndex) || instanceIndex <= 0) {
    return null;
  }

  return { baseFieldName, instanceIndex };
}

function parseInstanceIndex(value: string): number {
  const halfWidth = value.replace(/[\uff10-\uff19]/g, (char) =>
    String(char.charCodeAt(0) - 0xff10),
  );
  const numeric = Number(halfWidth);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return parseChineseInteger(value);
}

function parseChineseInteger(value: string): number {
  const chineseDigits: Record<string, number> = {
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6,
    "\u4e03": 7,
    "\u516b": 8,
    "\u4e5d": 9,
  };
  if (value === "\u5341") {
    return 10;
  }
  const tenIndex = value.indexOf("\u5341");
  if (tenIndex >= 0) {
    const before = value.slice(0, tenIndex);
    const after = value.slice(tenIndex + 1);
    const tens = before ? chineseDigits[before] : 1;
    const ones = after ? chineseDigits[after] : 0;
    if (!tens || ones === undefined) {
      return Number.NaN;
    }
    return tens * 10 + ones;
  }
  return chineseDigits[value] ?? Number.NaN;
}
