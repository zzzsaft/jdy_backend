import axios from "axios";
import { ApiClient } from "./api_client";
import { token, token_address } from "./token";

class ContactApiClient extends ApiClient {
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
  async getUserList(department_id: string) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/user/list",
        payload: {},
        query: {
          access_token: await token.get_token(),
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
  async getDepartmentInfo(department_id: number) {
    return await this.doRequest(
      {
        method: "GET",
        path: "/cgi-bin/department/get",
        payload: {},
        query: {
          access_token: await token.get_token(),
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
