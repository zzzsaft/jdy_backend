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
        storeId: "332265869940375552",
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

  async authAsync(personFileId) {
    return await this.doRequest({
      method: "POST",
      path: "/gateway/dsc-owner/api/authAsync",
      payload: [
        { operateType: 1, deviceId: "AD091B6PAJ15DFE", personFileId },
        { operateType: 1, deviceId: "AC0F22DPAJ9C7DB", personFileId },
        { operateType: 1, deviceId: "AC0F22DPAJ722C6", personFileId },
      ],
    });
  }
}
export const personApiClient = new PersonApiClient();
