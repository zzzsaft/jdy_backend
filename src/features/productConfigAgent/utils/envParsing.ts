export function readBooleanEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function readOptionalPositiveIntEnv(
  name: string,
): number | undefined {
  const raw = process.env[name];
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "all") {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number or all`);
  }
  return Math.floor(value);
}

export function readPositiveIntEnv(name: string, defaultValue: number): number {
  const value = readOptionalPositiveIntEnv(name);
  return value ?? defaultValue;
}

export function readBoundedPositiveIntEnv(
  name: string,
  defaultValue: number,
  maxValue: number,
): number {
  return Math.min(maxValue, readPositiveIntEnv(name, defaultValue));
}
