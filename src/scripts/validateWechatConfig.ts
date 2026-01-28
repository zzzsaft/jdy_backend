import { wechatCorpConfigs } from "../features/wechat/wechatCorps";
import { logger } from "../config/logger";

const validateConfigs = () => {
  if (!wechatCorpConfigs.length) {
    throw new Error(
      "No WeChat corp configuration found. Set WECHAT_CORP_CONFIGS."
    );
  }

  const invalid = wechatCorpConfigs.filter(
    (config) =>
      !config.corpId ||
      !config.name ||
      !config.apps.length ||
      config.apps.some((app) => !app.agentId || !app.corpSecret || !app.name)
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
