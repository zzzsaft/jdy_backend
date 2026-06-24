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
    const getAccessToken = async () => {
      if (context === "hr") return await token.get_token();
      if (context === "crm") return await token_crm.get_token();
      return await getCorpToken(
        context.corpId,
        context.agentId,
        context.appName
      ).get_token();
    };
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/auth/getuserinfo",
        payload: {},
        query: {
          code: code,
        },
        tokenType: context === "crm" ? "crm" : "corp",
        localAccessToken: getAccessToken,
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
