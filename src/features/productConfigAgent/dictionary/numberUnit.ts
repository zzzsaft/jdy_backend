export type CachedUnitAlias = {
  id?: string;
  canonicalUnit: string;
  displayUnit?: string | null;
  aliasValue?: string;
};

export type NormalizedNumberUnit = {
  rawValue: string;
  numericText?: string;
  numberKind: "single" | "range" | "none";
  value?: string;
  rangeStart?: string;
  rangeEnd?: string;
  rangeMin?: string;
  rangeMax?: string;
  unitRaw?: string;
  normalizedUnitRaw?: string;
  unitCanonical?: string;
  displayUnit?: string;
  matchedAliasId?: string;
  normalizedValue: string;
  warnings: string[];
};

const NUMBER_PATTERN = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const RANGE_SEPARATOR_PATTERN = String.raw`(?:-|~|～|—|－|至|到)`;
const NUMBER_UNIT_PATTERN = new RegExp(
  String.raw`^\s*(${NUMBER_PATTERN})(?:\s*${RANGE_SEPARATOR_PATTERN}\s*(${NUMBER_PATTERN}))?\s*([^\d\s].*)?\s*$`,
  "u",
);

export function normalizeUnitAliasText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/³/g, "3")
    .replace(/²/g, "2")
    .replace(/μ/g, "u")
    .replace(/µ/g, "u")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/／/g, "/")
    .replace(/每/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function normalizeNumberUnit(
  rawValue: unknown,
  aliasMap: Map<string, CachedUnitAlias> = new Map(),
): NormalizedNumberUnit {
  const value = String(rawValue ?? "").trim();
  const compact = value.replace(/，/g, ",").trim();
  const match = compact.match(NUMBER_UNIT_PATTERN);
  if (!match) {
    return {
      rawValue: value,
      numberKind: "none",
      normalizedValue: value,
      warnings: ["number_unit_parse_failed"],
    };
  }

  const first = match[1];
  const second = match[2];
  const unitRaw = String(match[3] ?? "").trim();
  const normalizedUnitRaw = unitRaw ? normalizeUnitAliasText(unitRaw) : undefined;
  const alias = normalizedUnitRaw ? aliasMap.get(normalizedUnitRaw) : undefined;
  const unitCanonical = alias?.canonicalUnit;
  const displayUnit = alias?.displayUnit || alias?.canonicalUnit;
  const renderedUnit = displayUnit || unitRaw;
  const numberKind = second ? "range" : "single";
  const numericText = second ? `${first}-${second}` : first;
  const normalizedValue = [numericText, renderedUnit].filter(Boolean).join(" ");
  const result: NormalizedNumberUnit = {
    rawValue: value,
    numericText,
    numberKind,
    unitRaw: unitRaw || undefined,
    normalizedUnitRaw,
    unitCanonical,
    displayUnit: displayUnit ?? undefined,
    matchedAliasId: alias?.id,
    normalizedValue,
    warnings: [],
  };

  if (second) {
    result.rangeStart = first;
    result.rangeEnd = second;
    const a = Number(first);
    const b = Number(second);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      result.rangeMin = String(Math.min(a, b));
      result.rangeMax = String(Math.max(a, b));
    }
  } else {
    result.value = first;
  }

  if (unitRaw && !alias) {
    result.warnings.push("unit_alias_no_match");
  }
  if (!unitRaw) {
    result.warnings.push("unit_missing");
  }

  return result;
}
