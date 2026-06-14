export function normalizeOptionalString(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
