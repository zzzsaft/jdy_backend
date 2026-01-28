import axios from "axios";
import {
  getCorpAppConfig,
  wechatCorpConfigs,
} from "../../../config/wechatCorps";

interface TokenConfig {
  corp_id: string;
  corp_secret: string;
}

interface AccessTokenResponse {
  errcode: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

class Token {
  private corp_id: string;
  private corp_secret: string;
  private accessToken: string = "";
  private expire: number = 0;

  constructor(config: TokenConfig) {
    this.corp_id = config.corp_id;
    this.corp_secret = config.corp_secret;
  }

  private async _get_access_token(): Promise<[string, number]> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corp_id}&corpsecret=${this.corp_secret}`;

    try {
      const response = await axios.get<AccessTokenResponse>(url);
      const response_json = response.data;
      if (response_json.errcode === 0 && response_json.access_token) {
        // console.log("企业微信 access_token 获取成功！");
      } else {
        console.error("企业微信 access_token 获取失败！错误信息：");
        const { errcode, errmsg } = response_json;
        console.error(`errcode: ${errcode}\n errmsg: ${errmsg}`);
      }

      if (response_json.access_token && response_json.expires_in) {
        const { access_token, expires_in } = response_json;
        const expire_time = Math.floor(Date.now() / 1000) + expires_in - 60; // Subtract 60 seconds to avoid time discrepancy
        return [access_token, expire_time];
      } else {
        throw new Error("未能成功获取 access_token 或过期时间。");
      }
    } catch (error) {
      console.error("企业微信获取失败！错误信息：", error);
      throw error;
    }
  }

  public async get_token(): Promise<string> {
    if (Date.now() < this.expire * 1000) {
      return this.accessToken;
    } else {
      const [access_token, expire] = await this._get_access_token();
      this.accessToken = access_token;
      this.expire = expire;
      return this.accessToken;
    }
  }
}

const tokenMap = new Map<string, Token>();

const getTokenMapKey = (corp_id: string, corp_secret: string) =>
  `${corp_id}:${corp_secret}`;

const ensureToken = (config: TokenConfig): Token => {
  const key = getTokenMapKey(config.corp_id, config.corp_secret);
  const existing = tokenMap.get(key);
  if (existing) return existing;

  const created = new Token(config);
  tokenMap.set(key, created);
  return created;
};

wechatCorpConfigs.forEach((config) => {
  config.apps.forEach((app) => {
    ensureToken({ corp_id: config.corpId, corp_secret: app.corpSecret });
  });
});

export const getCorpToken = (
  corpIdOrName?: string,
  agentId?: number,
  appName?: string
) => {
  const { corpId: resolvedCorpId, corpSecret } = getCorpAppConfig(
    corpIdOrName,
    agentId,
    appName
  );
  return ensureToken({ corp_id: resolvedCorpId, corp_secret: corpSecret });
};

// Keep legacy exports for other features that rely on the default corp credentials
const parseAgentId = (value?: string): number | undefined => {
  const parsed = Number(value ?? "");
  return Number.isNaN(parsed) ? undefined : parsed;
};

const checkinAppName = process.env.WECHAT_APP_CHECKIN ?? "checkin";
const addressAppName = process.env.WECHAT_APP_ADDRESS ?? "address";
const crmAppName = process.env.WECHAT_APP_CRM ?? "crm";
const j1AppName = process.env.WECHAT_APP_J1 ?? "j1";

export const token = getCorpToken();
export const token_checkin = getCorpToken(
  process.env.WECHAT_CORP_CHECKIN,
  parseAgentId(process.env.CORP_AGENTID_CHECKIN),
  checkinAppName
);
export const token_address = getCorpToken(
  process.env.WECHAT_CORP_ADDRESS,
  parseAgentId(process.env.CORP_AGENTID_ADDRESS),
  addressAppName
);
export const token_crm = getCorpToken(
  process.env.WECHAT_CORP_CRM,
  parseAgentId(process.env.CORP_AGENTID_CRM),
  crmAppName
);
export const token_j1 = getCorpToken(
  process.env.WECHAT_CORP_J1,
  parseAgentId(process.env.CORP_AGENTID_J1),
  j1AppName
);
