import { IRequestOptions } from "../../type/IType.js";
import { connectorJSON } from "../connector/client.js";
export class ApiClient {
  async doRequest(options: IRequestOptions) {
    if (options.method !== "GET" || options.path !== "/geocode/regeo") throw new Error("Unsupported Amap request");
    return connectorJSON("/v1/providers/amap/reverse-geocode", { location: options.query?.location });
  }
}
