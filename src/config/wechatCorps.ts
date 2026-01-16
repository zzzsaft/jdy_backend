import { logger } from "./logger";

type RawCorpAppConfig = {
  agentId?: number;
  corpSecret?: string;
  name?: string;
};

type RawCorpConfig = {
  corpId?: string;
  corpSecret?: string;
  encodingAESKey?: string;
  name?: string;
  apps?: RawCorpAppConfig[];
};

export interface WechatCorpAppConfig {
  agentId: number;
  corpSecret: string;
  name?: string;
}

export interface WechatCorpConfig {
  corpId: string;
  corpSecret: string;
  encodingAESKey: string;
  name?: string;
  apps?: WechatCorpAppConfig[];
}

const fallbackCorpId = process.env.CORP_ID ?? "";
const fallbackCorpSecret = process.env.CORP_SECRET ?? "";
const fallbackEncodingKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";

const parseApps = (apps?: RawCorpAppConfig[]): WechatCorpAppConfig[] => {
  if (!apps) return [];

  return apps
    .filter((item) => item?.agentId && item?.corpSecret)
    .map((item) => ({
      agentId: item.agentId ?? 0,
      corpSecret: item.corpSecret ?? "",
      name: item.name,
    }));
};

const parseCorpConfigs = (): WechatCorpConfig[] => {
  const rawConfig = process.env.WECHAT_CORP_CONFIGS;
  const fallbackApps: WechatCorpAppConfig[] = [];

  const defaultAgentId = Number(process.env.CORP_AGENTID ?? "");
  if (!Number.isNaN(defaultAgentId) && fallbackCorpSecret) {
    fallbackApps.push({
      agentId: defaultAgentId,
      corpSecret: fallbackCorpSecret,
      name: "default",
    });
  }

  const crmAgentId = Number(process.env.CORP_AGENTID_CRM ?? "");
  if (!Number.isNaN(crmAgentId) && process.env.CORP_SECRET_CRM) {
    fallbackApps.push({
      agentId: crmAgentId,
      corpSecret: process.env.CORP_SECRET_CRM,
      name: "crm",
    });
  }

  if (!rawConfig) {
    return [
      {
        corpId: fallbackCorpId,
        corpSecret: fallbackCorpSecret,
        encodingAESKey: fallbackEncodingKey,
        name: "default",
        apps: fallbackApps,
      },
    ];
  }

  try {
    const parsed = JSON.parse(rawConfig) as RawCorpConfig[];
    const sanitized = parsed
      .filter((item) => item?.corpId && item?.corpSecret && item?.encodingAESKey)
      .map((item) => ({
        corpId: item.corpId ?? "",
        corpSecret: item.corpSecret ?? "",
        encodingAESKey: item.encodingAESKey ?? "",
        name: item.name,
        apps: parseApps(item.apps),
      }));

    if (sanitized.length === 0) {
      throw new Error("No valid corp config provided");
    }

    return sanitized;
  } catch (error) {
    logger.error("Failed to parse WECHAT_CORP_CONFIGS", error);
    return [
      {
        corpId: fallbackCorpId,
        corpSecret: fallbackCorpSecret,
        encodingAESKey: fallbackEncodingKey,
        name: "default",
        apps: fallbackApps,
      },
    ];
  }
};

export const wechatCorpConfigs: WechatCorpConfig[] = parseCorpConfigs();
export const defaultWechatCorpConfig: WechatCorpConfig = wechatCorpConfigs[0];

export const getCorpConfig = (corpIdOrName?: string): WechatCorpConfig => {
  if (!corpIdOrName) return defaultWechatCorpConfig;
  return (
    wechatCorpConfigs.find(
      (config) =>
        config.corpId === corpIdOrName ||
        (config.name && config.name === corpIdOrName)
    ) ?? defaultWechatCorpConfig
  );
};

export const getCorpAppConfig = (
  corpIdOrName?: string,
  agentId?: number,
  appName?: string
): { corpId: string; corpSecret: string; agentId?: number } => {
  const corp = getCorpConfig(corpIdOrName);
  const app = corp.apps?.find((item) => {
    if (appName && item.name === appName) return true;
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

  return { corpId: corp.corpId, corpSecret: corp.corpSecret, agentId };
};

export const getCorpList = (corpId?: string): WechatCorpConfig[] => {
  if (!corpId) return wechatCorpConfigs;
  const target = getCorpConfig(corpId);
  return [target];
};
