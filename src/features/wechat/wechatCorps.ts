import { logger } from "../../config/logger.js";
import fs from "fs";
import path from "path";

type RawCorpAppConfig = {
  agentId?: number;
  corpSecret?: string;
  name?: string;
  clientId?: string;
  allowedOrigins?: string[];
  scopes?: string[];
};

type RawCorpConfig = {
  corpId?: string;
  name?: string;
  apps?: RawCorpAppConfig[];
  encodingAESKey?: string;
};

export interface WechatCorpAppConfig {
  agentId: number;
  corpSecret: string;
  name: string;
  clientId?: string;
  allowedOrigins: string[];
  scopes: string[];
}

export interface WechatAuthClientConfig {
  clientId: string;
  corpId: string;
  corpName: string;
  agentId: number;
  appName: string;
  corpSecret: string;
  allowedOrigins: string[];
  scopes: string[];
}

export interface WechatCorpConfig {
  corpId: string;
  name: string;
  encodingAESKey?: string;
  apps: WechatCorpAppConfig[];
}

const defaultCorpName = "jctimes";
const defaultAppName = "OA";

const parseOriginList = (value?: string): string[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Fall back to comma-separated parsing below.
    }
  }

  return trimmed
    .split(/[,\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const clientOriginEnvName = (clientId: string): string =>
  `WECHAT_AUTH_ALLOWED_ORIGINS_${clientId
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toUpperCase()}`;

export const resolveWechatAuthAllowedOrigins = (
  clientId?: string,
  configuredOrigins: string[] = [],
  env: NodeJS.ProcessEnv = process.env
): string[] => {
  const envOrigins = [
    ...parseOriginList(env.WECHAT_AUTH_ALLOWED_ORIGINS),
    ...(clientId ? parseOriginList(env[clientOriginEnvName(clientId)]) : []),
  ];
  return [...new Set([...configuredOrigins, ...envOrigins].filter(Boolean))];
};

const parseApps = (apps?: RawCorpAppConfig[]): WechatCorpAppConfig[] => {
  if (!apps) return [];

  return apps
    .filter((item) => item?.agentId && item?.name)
    .map((item) => ({
      agentId: item.agentId ?? 0,
      corpSecret: item.corpSecret ?? "",
      name: item.name ?? "",
      clientId: item.clientId?.trim() || undefined,
      allowedOrigins: resolveWechatAuthAllowedOrigins(
        item.clientId?.trim() || undefined,
        item.allowedOrigins?.filter(Boolean) ?? []
      ),
      scopes: item.scopes?.filter(Boolean) ?? [],
    }));
};

const parseCorpConfigs = (): WechatCorpConfig[] => {
  const configPath = path.resolve(process.cwd(), "wechat.json");

  if (!fs.existsSync(configPath)) {
    logger.error(`wechat.json is missing at ${configPath}`);
    return [];
  }

  try {
    const rawConfig = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(rawConfig) as RawCorpConfig[];
    const sanitized = parsed
      .filter((item) => item?.corpId && item?.name)
      .map((item) => ({
        corpId: item.corpId ?? "",
        name: item.name ?? "",
        encodingAESKey: item.encodingAESKey,
        apps: parseApps(item.apps),
      }));

    if (sanitized.length === 0) {
      throw new Error("No valid corp config provided");
    }

    return sanitized;
  } catch (error) {
    logger.error("Failed to parse WECHAT_CORP_CONFIGS", error);
    return [];
  }
};

export const wechatCorpConfigs: WechatCorpConfig[] = parseCorpConfigs();
export const defaultWechatCorpConfig: WechatCorpConfig = wechatCorpConfigs.find(
  (config) => config.name === defaultCorpName
) ??
  wechatCorpConfigs[0] ?? {
    corpId: "",
    name: defaultCorpName,
    apps: [],
  };

export const getCorpConfig = (corpIdOrName?: string): WechatCorpConfig => {
  if (!corpIdOrName) return defaultWechatCorpConfig;
  const corp = wechatCorpConfigs.find(
    (config) => config.corpId === corpIdOrName || config.name === corpIdOrName
  );
  if (!corp) throw new Error(`Unknown WeChat corp: ${corpIdOrName}`);
  return corp;
};

export const getCorpAppConfig = (
  corpIdOrName?: string,
  agentId?: number,
  appName?: string
): { corpId: string; corpSecret: string; agentId?: number } => {
  const corp = getCorpConfig(corpIdOrName ?? defaultCorpName);
  const app = appName
    ? corp.apps.find((item) => item.name === appName)
    : agentId
      ? corp.apps.find((item) => item.agentId === agentId)
      : corp.apps.find((item) => item.name === defaultAppName);

  if (app) {
    return {
      corpId: corp.corpId,
      corpSecret: app.corpSecret,
      agentId: app.agentId,
    };
  }

  throw new Error(
    `Unknown WeChat app for corp ${corp.corpId}: ${appName ?? agentId ?? defaultAppName}`
  );
};

const authClients = wechatCorpConfigs.flatMap((corp) =>
  corp.apps
    .filter((app) => app.clientId)
    .map((app) => ({
      clientId: app.clientId ?? "",
      corpId: corp.corpId,
      corpName: corp.name,
      agentId: app.agentId,
      appName: app.name,
      corpSecret: app.corpSecret,
      allowedOrigins: app.allowedOrigins,
      scopes: app.scopes,
    }))
);

export const getWechatAuthClients = (): WechatAuthClientConfig[] =>
  authClients.map((client) => ({ ...client }));

export const getWechatAuthAllowedOrigins = (): string[] => [
  ...new Set(authClients.flatMap((client) => client.allowedOrigins)),
];

export const getWechatAuthClient = (
  clientId: string
): WechatAuthClientConfig => {
  const client = authClients.find((item) => item.clientId === clientId);
  if (!client) throw new Error(`Unknown WeChat auth client: ${clientId}`);
  if (!client.corpSecret) {
    throw new Error(`Incomplete WeChat auth client: ${clientId}`);
  }
  return { ...client };
};

export const validateWechatAuthClients = (): void => {
  const ids = new Set<string>();
  for (const client of authClients) {
    if (ids.has(client.clientId)) {
      throw new Error(`Duplicate WeChat auth client: ${client.clientId}`);
    }
    ids.add(client.clientId);
    getWechatAuthClient(client.clientId);
    if (process.env.NODE_ENV === "production" && client.allowedOrigins.length === 0) {
      logger.warn(
        `allowedOrigins is empty for auth client: ${client.clientId}. ` +
          `Browser credentialed CORS and Cookie CSRF checks require an exact origin; ` +
          `set allowedOrigins in wechat.json or ${clientOriginEnvName(client.clientId)}.`
      );
    }
  }
  const requiredClients = [
    {
      clientId: "legacy-frontend",
      corpId: "wwd56c5091f4258911",
      agentId: 1000044,
    },
    {
      clientId: "new-frontend",
      corpId: "ww8a8396c98dc4923d",
      agentId: 1000002,
    },
  ];
  for (const expected of requiredClients) {
    const client = getWechatAuthClient(expected.clientId);
    if (client.corpId !== expected.corpId || client.agentId !== expected.agentId) {
      throw new Error(`Invalid WeChat auth client mapping: ${expected.clientId}`);
    }
  }
};

export const getCorpList = (corpId?: string): WechatCorpConfig[] => {
  if (!corpId) return wechatCorpConfigs;
  const target = getCorpConfig(corpId);
  return [target];
};
