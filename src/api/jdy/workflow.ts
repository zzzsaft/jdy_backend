import { ILimitOpion } from "../../type/IType";
import { IFormData } from "../../type/jdy/IData";
import {
  IDataCreateOption,
  IDataQueryOption,
  IDataUpdateOption,
  IDatasCreateOption,
} from "../../type/jdy/IOptions";
import { ApiClient } from "./api_client";

const FORM_DATA_BASE_PATH = "app/entry/data/";

class WorkFlowApiClient extends ApiClient {
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
   * 查询流程实例信息
   */
  async workflowInstanceGet(instance_id) {
    return await this.doRequest(
      {
        method: "POST",
        path: "workflow/instance/get",
        payload: {
          instance_id,
          tasks_type: 1,
        },
      },
      {
        name: "workflowInstanceGet",
        duration: 1000,
        limit: 20,
      }
    );
  }

  /**
   * 结束流程实例信息
   */
  async workflowInstanceClose(instance_id) {
    return await this.doRequest(
      {
        method: "POST",
        path: "workflow/instance/close",
        payload: {
          instance_id,
        },
      },
      {
        name: "workflowInstanceClose",
        duration: 1000,
        limit: 20,
      }
    );
  }
}

export const workflowApiClient = new WorkFlowApiClient("v5");
