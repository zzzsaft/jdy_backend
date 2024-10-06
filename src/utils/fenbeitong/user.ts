import { ApiClient } from "./api_client";

class FBTUserApiClient extends ApiClient {
  async getSSOLink(phone: string, path: string) {
    const result = await this.sso(phone);
    if (result.code === 0) {
      return `https://webapp.fenbeitong.com/ceLogin?token=${result.data}&path=${path}`;
    }

    return null;
  }
  private async sso(phone: string) {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/auth/web/v1/dispense",
      payload: {
        phone,
      },
    });
  }
  private async _getUserList(page_index = 1) {
    return await this.doRequest({
      method: "POST",
      path: "/openapi/org/employee/v1/list",
      payload: {
        page_index,
        page_size: 500,
      },
    });
  }
  async getUserList() {
    let page = 1;
    let res = await this._getUserList(page);
    let result = res.data.employees;
    while (page < res.data.total_pages) {
      page++;
      res = await this._getUserList(page);
      result = result.concat(res.data.employees);
    }
    return result;
  }
}
export const fbtUserApiClient = new FBTUserApiClient();
