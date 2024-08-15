import { appApiClient, connectApiClient } from "./api_client";

class XFTOAApiClient {
  async operate(payload) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/xft-oa/openapi/xft-oa/open/operate/proc/inst/deal",
        payload,
      },
      {
        name: "getOrgnizationList",
        duration: 1000,
        limit: 20,
      }
    );
  }
}
export const xftOAApiClient = new XFTOAApiClient();
