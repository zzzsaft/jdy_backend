export function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function asStringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function uniqueStringArray(value: unknown, limit = 10): string[] {
  return [
    ...new Set(
      asArray(value)
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

export function normalizeSuggestedProductTypes(value: unknown): string[] {
  return uniqueStringArray(value, 12);
}

export function normalizeReviewSplits(value: unknown) {
  return asArray(value)
    .map((item) => ({
      termType: asStringOrNull(item?.termType),
      displayName: asStringOrNull(item?.displayName),
      valueKind: asStringOrNull(item?.valueKind),
      rawValue: asStringOrNull(item?.rawValue ?? item?.value),
      canonicalValue: asStringOrNull(item?.canonicalValue),
      aliasNames: uniqueStringArray(item?.aliasNames),
      valueAliasNames: uniqueStringArray(item?.valueAliasNames),
      aliases: uniqueStringArray(item?.aliases),
      applicableProductTypes: normalizeSuggestedProductTypes(
        item?.applicableProductTypes,
      ),
    }))
    .filter(
      (item) =>
        item.termType &&
        (item.rawValue || item.canonicalValue || item.displayName),
    )
    .slice(0, 8);
}

export function normalizeValueSplitRows(value: unknown) {
  return normalizeReviewSplits(value)
    .map((item) => ({
      termType: item.termType ?? "",
      rawValue: item.rawValue ?? item.canonicalValue ?? item.displayName ?? "",
    }))
    .filter((item) => item.termType && item.rawValue);
}

export function normalizeTermTypeSplitRows(value: unknown) {
  return normalizeReviewSplits(value).map((item) => ({
    termType: item.termType ?? "",
    displayName: item.displayName ?? undefined,
    valueKind: item.valueKind ?? undefined,
    rawValue: item.rawValue ?? undefined,
    canonicalValue: item.canonicalValue ?? undefined,
    aliasNames: item.aliasNames.length ? item.aliasNames : undefined,
    valueAliasNames: item.valueAliasNames.length
      ? item.valueAliasNames
      : undefined,
    applicableProductTypes: item.applicableProductTypes.length
      ? item.applicableProductTypes
      : undefined,
  }));
}
