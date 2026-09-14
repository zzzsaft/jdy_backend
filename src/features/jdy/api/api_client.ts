import { ILimitOpion, IRequestOptions } from "../../../type/IType.js";
import { jdyLimiter } from "../../../config/limiter.js";
import { connectorJSON } from "../../../api/connector/client.js";
export class ApiClient {
  constructor(protected version: string) {}
  protected async doRequest(options: IRequestOptions, limitOption: ILimitOpion) {
    if (options.method.toUpperCase() !== "POST" || Object.keys(options.query ?? {}).length) throw new Error("Unsupported Jiandaoyun request");
    await jdyLimiter.tryBeforeRun(limitOption);
    return connectorJSON("/v1/providers/jiandaoyun/invoke", {
      path: `/api/${options.version ?? this.version}/${options.path.replace(/^\//, "")}`, body: options.payload ?? {},
    });
  }
}
