import { readBooleanEnv } from "../utils/envParsing.js";

export {
  readBooleanEnv,
  readBoundedPositiveIntEnv,
  readOptionalPositiveIntEnv,
  readPositiveIntEnv,
} from "../utils/envParsing.js";

export function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

export function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function readOptionalPositiveIntArg(
  name: string,
  fallback?: number,
): number | undefined {
  const raw = readArg(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

export function readApplyFlag(params?: {
  argName?: string;
  envName?: string;
}): boolean {
  const argName = params?.argName ?? "apply";
  const envName = params?.envName;
  return hasArg(argName) || (envName ? readBooleanEnv(envName) : false);
}
