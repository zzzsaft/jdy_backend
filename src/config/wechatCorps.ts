import fs from "fs";
import path from "path";
import { logger } from "./logger";

type RawCorpAppConfig = {
  agentId?: number;
  corpSecret?: string;
  name?: string;
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
}

export interface WechatCorpConfig {
  corpId: string;
  name: string;
  encodingAESKey?: string;
  apps: WechatCorpAppConfig[];
}

const defaultCorpName = "jctimes";
const defaultAppName = "OA";

const parseApps = (apps?: RawCorpAppConfig[]): WechatCorpAppConfig[] => {
  if (!apps) return [];

  return apps
    .filter((item) => item?.agentId && item?.corpSecret && item?.name)
    .map((item) => ({
      agentId: item.agentId ?? 0,
      corpSecret: item.corpSecret ?? "",
      name: item.name ?? "",
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
    logger.error("Failed to parse wechat.json", error);
    return [];
  }
};

export const wechatCorpConfigs: WechatCorpConfig[] = parseCorpConfigs();
export const defaultWechatCorpConfig: WechatCorpConfig = (
  wechatCorpConfigs.find((config) => config.name === defaultCorpName) ??
  wechatCorpConfigs[0] ?? {
    corpId: "",
    name: defaultCorpName,
    apps: [],
  }
);

export const getCorpConfig = (corpIdOrName?: string): WechatCorpConfig => {
  if (!corpIdOrName) return defaultWechatCorpConfig;
  return (
    wechatCorpConfigs.find(
      (config) =>
        config.corpId === corpIdOrName ||
        config.name === corpIdOrName
    ) ?? defaultWechatCorpConfig
  );
};

export const getCorpAppConfig = (
  corpIdOrName?: string,
  agentId?: number,
  appName?: string
): { corpId: string; corpSecret: string; agentId?: number } => {
  const corp = getCorpConfig(corpIdOrName ?? defaultCorpName);
  const resolvedAppName = appName ?? defaultAppName;
  const app = corp.apps.find((item) => {
    if (resolvedAppName && item.name === resolvedAppName) return true;
    if (agentId && item.agentId === agentId) return true;
    return false;
  });

  if (app) {
    return {
      corpId: corp.corpId,
      corpSecret: app.corpSecret,
      agentId: app.agentId,
    };
  }

  return { corpId: corp.corpId, corpSecret: "", agentId };
};

export const getCorpList = (corpId?: string): WechatCorpConfig[] => {
  if (!corpId) return wechatCorpConfigs;
  const target = getCorpConfig(corpId);
  return [target];
};
