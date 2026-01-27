import { ILimitOpion } from "../../../type/IType";
import { ApiClient } from "./api_client";

const FORM_BASE_PATH = "app/entry/";

class FormApiClient extends ApiClient {
  protected validVersions = ["v5"];
  protected defaultVersion = "v5";

  /**
   * check version
   */
  protected async doRequest(options, limitOption: ILimitOpion) {
    if (!this.validVersions.includes(this.version)) {
      this.version = this.defaultVersion;
    }
    return super.doRequest(options, limitOption);
  }

  /**
   * 表单字段查询接口
   */
  async formWidgets(app_id, entry_id) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_BASE_PATH + "widget/list",
        payload: {
          app_id,
          entry_id,
        },
      },
      {
        name: "formWidgets",
        duration: 1000,
        limit: 30,
      }
    );
  }
}
export const formApiClient = new FormApiClient("v5");
