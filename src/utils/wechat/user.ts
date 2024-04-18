import { ApiClient } from "./api_client";
import { token, token_address } from "./token";

class UserApiClient extends ApiClient {
  async getUser(userid: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/get",
        payload: {},
        query: {
          access_token: await token.get_token(),
          userid: userid,
        },
      },
      {
        name: "getUser",
        duration: 1000,
        limit: 30,
      }
    );
  }
  async getDepartmentList() {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/department/list",
        payload: {},
        query: {
          access_token: await token.get_token(),
        },
      },
      {
        name: "getDepartmentList",
        duration: 1000,
        limit: 1,
      }
    );
  }
  async getUserList(department_id: number) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/simplelist",
        payload: {},
        query: {
          access_token: await token.get_token(),
          department_id: department_id,
        },
      },
      {
        name: "getUserList",
        duration: 1000,
        limit: 1,
      }
    );
  }
}

export const userApiClient = new UserApiClient();
