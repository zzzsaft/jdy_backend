import { logger } from "./logger";

type RawCorpConfig = {
  corpId?: string;
  corpSecret?: string;
  encodingAESKey?: string;
  name?: string;
};

export interface WechatCorpConfig {
  corpId: string;
  corpSecret: string;
  encodingAESKey: string;
  name?: string;
}

const fallbackCorpId = process.env.CORP_ID ?? "";
const fallbackCorpSecret = process.env.CORP_SECRET ?? "";
const fallbackEncodingKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";

const parseCorpConfigs = (): WechatCorpConfig[] => {
  const rawConfig = process.env.WECHAT_CORP_CONFIGS;
  if (!rawConfig) {
    return [
      {
        corpId: fallbackCorpId,
        corpSecret: fallbackCorpSecret,
        encodingAESKey: fallbackEncodingKey,
        name: "default",
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
      },
    ];
  }
};

export const wechatCorpConfigs: WechatCorpConfig[] = parseCorpConfigs();
export const defaultWechatCorpConfig: WechatCorpConfig = wechatCorpConfigs[0];

export const getCorpConfig = (corpId?: string): WechatCorpConfig => {
  if (!corpId) return defaultWechatCorpConfig;
  return (
    wechatCorpConfigs.find((config) => config.corpId === corpId) ??
    defaultWechatCorpConfig
  );
};

export const getCorpList = (corpId?: string): WechatCorpConfig[] => {
  if (!corpId) return wechatCorpConfigs;
  const target = getCorpConfig(corpId);
  return [target];
};
