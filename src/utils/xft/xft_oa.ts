import { sleep } from "../../config/limiter";
import { User } from "../../entity/wechat/User";
import { appApiClient, connectApiClient } from "./api_client";

class XFTOAApiClient {
  async start(payload: { starterId: string; trialId: string }) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oa/open/operate/proc/inst/trial",
      payload,
    });
  }
  async trial({
    starterId,
    trialType = "startTrial",
    procKey = "FORM_AAA00512_PX7732d530840a4851adPX",
    busData,
  }) {
    const payload = {
      starterId,
      trialType,
      procKey,
      busData: JSON.stringify(busData),
    };
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oa/open/operate/proc/inst/trial",
      payload,
    });
  }
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
}
export const xftOAApiClient = new XFTOAApiClient();
