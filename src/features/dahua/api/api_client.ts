import { connectorJSON } from "../../../api/connector/client.js";
import { IRequestOptions } from "../../../type/IType.js";

export class ApiClient {
  protected async doRequest(options: IRequestOptions, _host?: string) {
    return connectorJSON("/v1/providers/dahua/invoke", {
      method: options.method.toUpperCase(), path: options.path,
      query: options.query, payload: options.payload,
    });
  }
}
