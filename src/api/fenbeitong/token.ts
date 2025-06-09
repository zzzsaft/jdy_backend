import axios from "axios";
import dotenv from "dotenv";

interface AccessTokenResponse {
  code?: number;
  data: string;
  request_id?: string;
}

class Token {
  private app_id: string;
  private app_key: string;
  private accessToken: string = "";
  private expire: number = 0;
  private host: string;

  constructor() {
    this.host = process.env.FBT_HOST ?? "";
    this.app_id = process.env.FBT_APPID ?? "";
    this.app_key = process.env.FBT_KEY ?? "";
  }

  private async _get_access_token(): Promise<[string, number]> {
    const url = `${this.host}/openapi/auth/getToken`;
    const data = {
      app_id: this.app_id,
      app_key: this.app_key,
    };
    try {
      const response = await axios.post<AccessTokenResponse>(url, data);
      const response_json = response.data;

      if (response_json.code == 0) {
        const { data } = response_json;
        const expire_time = Math.floor(Date.now() / 1000) + 7200 - 60; // Subtract 60 seconds to avoid time discrepancy
        return [data, expire_time];
      } else {
        throw new Error("未能成功获取 access_token 或过期时间。");
      }
    } catch (error) {
      console.error("fbtaccess_token获取失败！错误信息：", error);
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

export const fengbeitong_token = new Token();
