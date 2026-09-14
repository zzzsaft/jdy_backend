import { connectorJSON } from "../../../api/connector/client.js";
import { ApiClient } from "./api_client.js";

class FBTUserApiClient extends ApiClient {
  async getSSOLink(phone: string | undefined, path: string) {
    if (!phone) {
      return null;
    }
    const result = await connectorJSON("/v1/providers/fenbeitong/sso-link", { thirdUserId: phone, path });
    return result.url;
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
