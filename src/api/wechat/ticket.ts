import axios from "axios";
import { token } from "./token";

interface AccessTokenResponse {
  errcode: number;
  errmsg?: string;
  ticket?: string;
  expires_in?: number;
}

class Ticket {
  private type: string;
  private ticket: string = "";
  private expire: number = 0;

  constructor(type: "agent" | "corp") {
    this.type = type;
  }

  private async _get_ticket(): Promise<[string, number]> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=${await token.get_token()}`;
    const url2 = `https://qyapi.weixin.qq.com/cgi-bin/ticket/get?access_token=${await token.get_token()}&type=agent_config`;

    try {
      let response;
      if (this.type == "corp") {
        response = await axios.get<AccessTokenResponse>(url);
      } else {
        response = await axios.get<AccessTokenResponse>(url2);
      }
      const response_json = response.data;
      if (response_json.errcode === 0 && response_json.ticket) {
        // console.log("企业微信 access_token 获取成功！");
      } else {
        console.error("企业微信 ticket 获取失败！错误信息：");
        const { errcode, errmsg } = response_json;
        console.error(`errcode: ${errcode}\n errmsg: ${errmsg}`);
      }

      if (response_json.ticket && response_json.expires_in) {
        const { ticket, expires_in } = response_json;
        const expire_time = Math.floor(Date.now() / 1000) + expires_in - 60; // Subtract 60 seconds to avoid time discrepancy
        return [ticket, expire_time];
      } else {
        throw new Error("未能成功获取 ticket 或过期时间。");
      }
    } catch (error) {
      console.error("企业微信获取失败！错误信息：", error);
      throw error;
    }
  }

  public async get_ticket(): Promise<string> {
    if (Date.now() < this.expire * 1000) {
      return this.ticket;
    } else {
      const [ticket, expire] = await this._get_ticket();
      this.ticket = ticket;
      this.expire = expire;
      return this.ticket;
    }
  }
}
// dotenv.config();
// Example usage
export const corpTicket = new Ticket("corp");
export const agentTicket = new Ticket("agent");
