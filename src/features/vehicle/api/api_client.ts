import { connectorJSON } from "../../../api/connector/client.js";
import { IRequestOptions } from "../../../type/IType.js";

class ApiClient {
  async doRequest(options: IRequestOptions) {
    // Keep legacy transport-failure semantics; business envelopes pass through unchanged.
    try {
      return await connectorJSON("/v1/providers/parking/invoke", {
        method: options.method.toUpperCase(), path: options.path,
        query: options.query, payload: options.payload,
      });
    } catch {
      console.error("Parking Connect request failed");
      return undefined;
    }
  }
}
export const apiClient = new ApiClient();
