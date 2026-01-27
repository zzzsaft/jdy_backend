import { appApiClient, connectApiClient } from "./api_client";

class XFTOAApiClient {
  async start(payload: { starterId: string; trialId: string }) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-oa/openapi/xft-oa/open/operate/proc/inst/start",
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
    payload["needCallback"] = true;
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
  async runApi(
    codeFriendApiKey: string,
    payload: any,
    xftOpenAppId: string = "604ec40b-3ab8-4b8b-a93e-9fac566ce49a"
  ) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/codefriend-e/prd/executeApi/codefriend-e/gw/open/executeApi",
      query: { xftOpenAppId, codeFriendApiKey },
      payload,
    });
  }
  async trialCodeFriend(payload: any) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/codefriend/v2/gw/object/rt/bd5737d7f75f4dd8be/process/d66e5e3b38254f0286/trial",
      payload,
    });
  }
}
export const xftOAApiClient = new XFTOAApiClient();
