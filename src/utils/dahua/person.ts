import { ApiClient } from "./api_client";
import { logger } from "../../config/logger";

class PersonApiClient extends ApiClient {
  async addPersonFile(file: { name: string; facePhotoPath: string }) {
    return await this.doRequest({
      method: "POST",
      path: "/gateway/person/api/personFile",
      payload: {
        ...file,
        orgCode: "001100",
        storeId: "4464a5e675914ec7bb5340d3e85a0630",
      },
    });
  }

  async getOrgCode() {
    return await this.doRequest({
      method: "POST",
      path: "/gateway/membership/api/org/list",
      payload: { pageNum: 1, pageSize: 100 },
    });
  }
}
export const personApiClient = new PersonApiClient();
