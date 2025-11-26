import axios from "axios";
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
    // return "P4ay5RlD2sjHkPrZPigEOnm7iw8RJ4kPXIAlUuNDWUWJulezYs_-utmyQMSiguhyaEbV6q7vHDahdqd9VH5Q03UXFnEQoILVbf7Zkjt3OM_eY_x5FcqYgCZF4vCJX9GTaW5BkXXsdYi4HF-9PXKF18ZZy99FwKK9DtAX2W1sbGANGAMq_RWhWrAscxihotutCco7U3aehaTI2yUupauaSA";
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
// dotenv.config();
// Example usage
const config: TokenConfig = {
  corp_id: process.env.CORP_ID ?? "",
  corp_secret: process.env.CORP_SECRET ?? "",
};
const config2: TokenConfig = {
  corp_id: process.env.CORP_ID ?? "",
  corp_secret: process.env.CORP_SECRET_CHECKIN ?? "",
};
const config3: TokenConfig = {
  corp_id: process.env.CORP_ID ?? "",
  corp_secret: process.env.CORP_SECRET_ADDRESS ?? "",
};
const configCrm: TokenConfig = {
  corp_id: process.env.CORP_ID ?? "",
  corp_secret: process.env.CORP_SECRET_CRM ?? "",
};
const configJ1: TokenConfig = {
  corp_id: process.env.CORP_ID_J1 ?? "",
  corp_secret: process.env.CORP_SECRET_J1 ?? "",
};
export const token = new Token(config);
export const token_checkin = new Token(config2);
export const token_address = new Token(config3);
export const token_crm = new Token(configCrm);
export const token_j1 = new Token(configJ1);
