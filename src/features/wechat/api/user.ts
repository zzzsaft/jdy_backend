import { ApiClient } from "./api_client.js";
import { getCorpToken, token, token_crm } from "./token.js";

export type WechatUserAppContext = {
  corpId: string;
  agentId: number;
  appName: string;
};

class UserApiClient extends ApiClient {
  async getUserInfo(
    code: string,
    context: "hr" | "crm" | WechatUserAppContext = "hr"
  ) {
    let access_token;
    if (context === "hr") access_token = await token.get_token();
    else if (context === "crm") access_token = await token_crm.get_token();
    else {
      access_token = await getCorpToken(
        context.corpId,
        context.agentId,
        context.appName
      ).get_token();
    }
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/auth/getuserinfo",
        payload: {},
        query: {
          access_token,
          code: code,
        },
      },
      {
        name: "getUser",
        duration: 1000,
        limit: 30,
      }
    );
  }
}

export const wechatUserApiClient = new UserApiClient();
