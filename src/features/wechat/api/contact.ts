import { ApiClient } from "./api_client.js";
import { getCorpToken } from "./token.js";

class ContactApiClient extends ApiClient {
  private async getAccessToken(corpId?: string, appName?: string) {
    return await getCorpToken(corpId, undefined, appName).get_token();
  }

  async getUser(userid: string, corpId?: string, appName?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/get",
        payload: {},
        query: {
          userid: userid,
        },
        localAccessToken: () => this.getAccessToken(corpId, appName),
      },
      {
        name: "getUser",
        duration: 1000,
        limit: 30,
      }
    );
  }
  async getDepartmentList(corpId?: string, appName?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/department/list",
        payload: {},
        query: {},
        localAccessToken: () => this.getAccessToken(corpId, appName),
      },
      {
        name: "getDepartmentList",
        duration: 1000,
        limit: 1,
      }
    );
  }
  async getUserList(department_id: string, corpId?: string, appName?: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/list",
        payload: {},
        query: {
          department_id: department_id,
        },
        localAccessToken: () => this.getAccessToken(corpId, appName),
      },
      {
        name: "getUserList",
        duration: 2000,
        limit: 1,
      }
    );
  }
  async getDepartmentInfo(
    department_id: number,
    corpId?: string,
    appName?: string
  ) {
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/department/get",
        payload: {},
        query: {
          id: department_id,
        },
        localAccessToken: () => this.getAccessToken(corpId, appName),
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
