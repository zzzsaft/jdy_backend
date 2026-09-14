import { IRequestOptions } from "../../../type/IType.js";
import { connectorJSON } from "../../../api/connector/client.js";
export class ApiClient {
  constructor(private readonly profile: "app" | "connect") {}
  async doRequest(options: IRequestOptions, userId = "A0001", platformUserId = "AUTO0001") {
    if (options.payload?.formData instanceof FormData) {
      throw new Error("XFT multipart upload is not enabled in Connect");
    }
    return connectorJSON("/v1/providers/xft/invoke", {
      profile: this.profile, method: options.method.toUpperCase(), path: options.path,
      query: options.query ?? {}, payload: options.payload ?? {}, userId, platformUserId,
    });
  }
}
export const appApiClient = new ApiClient("app");
export const connectApiClient = new ApiClient("connect");
