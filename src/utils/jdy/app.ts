import { ILimitOpion } from "../../type/IType";
import { IAppList, IEntryList } from "../../type/jdy/IOptions";
import { ApiClient } from "./api_client";

const APP_BASE_PATH = "app/";
const FORM_BASE_PATH = "app/entry/";

class AppApiClient extends ApiClient {
  validVersions = ["v5"];
  defaultVersion = "v5";

  /**
   * check version
   */
  async doRequest(options, limitOption: ILimitOpion) {
    if (!this.validVersions.includes(this.version)) {
      this.version = this.defaultVersion;
    }
    return super.doRequest(options, limitOption);
  }

  /**
   * 用户应用查询接口
   */
  async appList(options: IAppList = {}) {
    return await this.doRequest(
      {
        method: "POST",
        path: APP_BASE_PATH + "list",
        payload: {
          ...options,
        },
      },
      {
        name: "appList",
        duration: 1000,
        limit: 30,
      }
    );
  }

  /**
   * 用户表单查询接口
   */
  async entryList(app_id, options: IEntryList = {}) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_BASE_PATH + "list",
        payload: {
          app_id,
          ...options,
        },
      },
      {
        name: "entryList",
        duration: 1000,
        limit: 30,
      }
    );
  }
}

export default new AppApiClient("v5");
