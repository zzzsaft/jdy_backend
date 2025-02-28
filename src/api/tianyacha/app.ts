import { IAppoint } from "../../type/IType";
import { ApiClient } from "./api_client";

class TYCApiClient extends ApiClient {
  async search(keyword: string) {
    return await this.doRequest({
      method: "GET",
      path: "/search/2.0",
      query: {
        word: keyword,
      },
    });
  }
  async baseInfo(keyword: string) {
    return await this.doRequest({
      method: "GET",
      path: "/ic/baseinfoV3/2.0",
      query: {
        word: keyword,
      },
    });
  }
}
export const tycApiClient = new TYCApiClient();
