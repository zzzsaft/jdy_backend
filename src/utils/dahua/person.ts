import { ApiClient } from "./api_client";
import { logger } from "../../config/logger";

type PersonFile = {
  name: string;
  facePhotoPath: string;
};

class PersonApiClient extends ApiClient {
  private async addPersonFile(file: { name: string }) {
    return await this.doRequest({
      method: "POST",
      path: "/gateway/person/api/personFile",
      payload: {},
    });
  }
}
export const personApiClient = new PersonApiClient();
