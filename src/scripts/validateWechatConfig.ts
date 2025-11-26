import { wechatCorpConfigs } from "../config/wechatCorps";
import { logger } from "../config/logger";

const validateConfigs = () => {
  if (!wechatCorpConfigs.length) {
    throw new Error("No WeChat corp configuration found. Set WECHAT_CORP_CONFIGS or legacy CORP_ID/CORP_SECRET/WECHAT_ENCODING_AES_KEY.");
  }

  const invalid = wechatCorpConfigs.filter(
    (config) => !config.corpId || !config.corpSecret || !config.encodingAESKey
  );

  if (invalid.length > 0) {
    throw new Error(
      `Invalid WeChat corp configuration detected for corpIds: ${invalid
        .map((item) => item.corpId || "<missing>")
        .join(",")}`
    );
  }

  logger.info(
    "Loaded WeChat corp configurations",
    wechatCorpConfigs.map((config) => ({
      corpId: config.corpId,
      name: config.name ?? "",
    }))
  );
};

(async () => {
  try {
    validateConfigs();
    logger.info("WeChat corp configuration validation passed");
  } catch (error) {
    logger.error("WeChat corp configuration validation failed", error);
    process.exitCode = 1;
  }
})();
