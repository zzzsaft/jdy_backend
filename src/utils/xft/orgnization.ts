import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";

class OrgnizationApiClient extends ApiClient {
  async getOrgnization() {
    return await this.doRequest(
      {
        method: "POST",
        path: "/ORG/orgqry/xft-service-organization/org/v1/get/page",
        payload: {},
      },
      {
        name: "getOrgnization",
        duration: 1000,
        limit: 20,
      }
    );
  }
}
export const orgnizationApiClient = new OrgnizationApiClient();
