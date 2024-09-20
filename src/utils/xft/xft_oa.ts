import { sleep } from "../../config/limiter";
import { User } from "../../entity/wechat/User";
import { appApiClient, connectApiClient } from "./api_client";

class XFTOAApiClient {
  async operate(payload) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oa/open/operate/proc/inst/deal",
      payload,
    });
  }
  async getFormData(busKeyList) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oaquery/form-data/query-list",
      payload: {
        busKeyList: busKeyList,
      },
    });
  }
}
export const xftOAApiClient = new XFTOAApiClient();
