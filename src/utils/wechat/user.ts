import { ApiClient } from "./api_client";
import { token, token_address } from "./token";

class UserApiClient extends ApiClient {
  async getUserInfo(code: string) {
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/auth/getuserinfo",
        payload: {},
        query: {
          access_token: await token.get_token(),
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
