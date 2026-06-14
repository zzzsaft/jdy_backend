import type { Response } from "express";

export function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const rejectedPaths = Array.isArray((error as any)?.rejectedPaths)
    ? (error as any).rejectedPaths
    : undefined;
  response.status(400).json({
    error: message,
    ...(rejectedPaths ? { rejectedPaths } : {}),
  });
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function optionalStringArray(value: unknown, limit = 10): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be a boolean`);
}
