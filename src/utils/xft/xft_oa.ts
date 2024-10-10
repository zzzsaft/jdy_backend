import { sleep } from "../../config/limiter";
import { User } from "../../entity/wechat/User";
import { appApiClient, connectApiClient } from "./api_client";

class XFTOAApiClient {
  async operate(payload: {
    approverId: string;
    operateType: string;
    busKey: string;
    taskId: string;
    approveComment?: string;
  }) {
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
  async getForm() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oaquery/form/query-list",
      payload: {},
    });
  }
  async getFormBussinesData() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oaquery/form-data/business/query-page-list",
      payload: {
        current: 1,
        size: 100,
      },
    });
  }
}
export const xftOAApiClient = new XFTOAApiClient();
