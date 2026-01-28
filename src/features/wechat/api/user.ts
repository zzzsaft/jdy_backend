import { ApiClient } from "./api_client";
import { token, token_address, token_crm } from "./token";

class UserApiClient extends ApiClient {
  async getUserInfo(code: string, setToken: "hr" | "crm" = "hr") {
    let access_token;
    if (setToken === "hr") access_token = await token.get_token();
    else if (setToken === "crm") access_token = await token_crm.get_token();
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
