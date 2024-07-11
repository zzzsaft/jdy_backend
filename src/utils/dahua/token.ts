import axios from "axios";
import dotenv from "dotenv";

interface AccessTokenResponse {
  access_token?: string;
  appId?: string;
  expires_in?: number;
}

class Token {
  private client_id: string;
  private client_secret: string;
  private accessToken: string = "";
  private expire: number = 0;

  constructor() {
    this.client_id = process.env.DAHUA_CLIENT_ID ?? "";
    this.client_secret = process.env.DAHUA_CLIENT_SECRET ?? "";
  }

  private async _get_access_token(): Promise<[string, number]> {
    const url = `https://www.cloud-dahua.com/gateway/auth/api/oauth/token`;
    const data = {
      grant_type: "client_credentials",
      scope: "server",
      client_id: this.client_id,
      client_secret: this.client_secret,
    };
    try {
      const response = await axios.post<AccessTokenResponse>(url, data);
      const response_json = response.data;

      if (response_json.access_token && response_json.expires_in) {
        const { access_token, expires_in } = response_json;
        const expire_time = Math.floor(Date.now() / 1000) + expires_in - 60; // Subtract 60 seconds to avoid time discrepancy
        return [access_token, expire_time];
      } else {
        throw new Error("未能成功获取 access_token 或过期时间。");
      }
    } catch (error) {
      console.error("大华开放平台access_token获取失败！错误信息：", error);
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

export const dahua_token = new Token();
