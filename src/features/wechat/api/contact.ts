import { ApiClient } from "./api_client";
import { getCorpToken } from "./token";

class ContactApiClient extends ApiClient {
  private async getAccessToken(corpId?: string) {
    return await getCorpToken(corpId).get_token();
  }

  async getUser(userid: string, corpId?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/get",
        payload: {},
        query: {
          access_token: await this.getAccessToken(corpId),
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
  async getDepartmentList(corpId?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/department/list",
        payload: {},
        query: {
          access_token: await this.getAccessToken(corpId),
        },
      },
      {
        name: "getDepartmentList",
        duration: 1000,
        limit: 1,
      }
    );
  }
  async getUserList(department_id: string, corpId?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/list",
        payload: {},
        query: {
          access_token: await this.getAccessToken(corpId),
          department_id: department_id,
        },
      },
      {
        name: "getUserList",
        duration: 2000,
        limit: 1,
      }
    );
  }
  async getDepartmentInfo(department_id: number, corpId?: string) {
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/department/get",
        payload: {},
        query: {
          access_token: await this.getAccessToken(corpId),
          id: department_id,
        },
      },
      {
        name: "getDepartmentInfo",
        duration: 1000,
        limit: 1,
      }
    );
  }
}

export const contactApiClient = new ContactApiClient();
