import { IAppoint } from "../../type/IType.js";
import { ApiClient } from "./api_client.js";

class GaoDeApiClient extends ApiClient {
  async reGeo(longitude: number, latitude: number) {
    return await this.doRequest({
      method: "GET",
      path: "/geocode/regeo",
      query: {
        location: `${longitude},${latitude}`,
        // extensions: "all",
      },
    });
  }
}
export const gaoDeApiClient = new GaoDeApiClient();
