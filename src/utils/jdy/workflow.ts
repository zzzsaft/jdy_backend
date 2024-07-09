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
   * 查询单条数据接口
   */
  async singleDataQuery(app_id, entry_id, data_id) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "get",
        payload: {
          app_id,
          entry_id,
          data_id,
        },
      },
      {
        name: "singleDataQuery",
        duration: 1000,
        limit: 30,
      }
    );
  }

  /**
   * 修改单条数据接口
   */
  async singleDataUpdate(
    app_id,
    entry_id,
    data_id,
    data: IFormData,
    options: IDataUpdateOption = {}
  ) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "update",
        payload: {
          app_id,
          entry_id,
          data_id,
          data,
          ...options,
        },
      },
      {
        name: "singleDataUpdate",
        duration: 1000,
        limit: 20,
      }
    );
  }

  /**
   * 删除单条数据接口
   */
  async singleDataRemove(
    app_id,
    entry_id,
    data_id,
    is_start_trigger: boolean = false
  ) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "delete",
        payload: {
          app_id,
          entry_id,
          data_id,
          is_start_trigger: is_start_trigger,
        },
      },
      {
        name: "singleDataRemove",
        duration: 1000,
        limit: 20,
      }
    );
  }
  /**
   * 新建多条数据接口
   */
  async batchDataCreate(
    app_id,
    entry_id,
    data_list: IFormData[],
    options: IDatasCreateOption = {}
  ) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "batch_create",
        payload: {
          app_id,
          entry_id,
          data_list,
          ...options,
        },
      },
      {
        name: "batchDataCreate",
        duration: 1000,
        limit: 10,
      }
    );
  }
  /**
   * 查询多条数据接口
   */
  async batchDataQuery(app_id, entry_id, options: IDataQueryOption) {
    let data = await this._batchDataQuery(app_id, entry_id, options);
    let result = data;
    while (data && data.length == 100) {
      const option = { ...options, data_id: result[result.length - 1]["_id"] };
      data = await this._batchDataQuery(app_id, entry_id, option);
      result = result.concat(data);
    }
    return result;
  }

  private async _batchDataQuery(
    app_id,
    entry_id,
    options: IDataQueryOption
  ): Promise<object[]> {
    const data = await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "list",
        payload: {
          app_id,
          entry_id,
          ...options,
        },
      },
      {
        name: "batchDataQuery",
        duration: 1000,
        limit: 30,
      }
    );
    return data["data"];
  }

  /**
   * 修改多条数据接口
   */
  async batchDataUpdate(
    app_id,
    entry_id,
    data_ids,
    data: IFormData,
    transactionId = ""
  ) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "batch_update",
        payload: {
          app_id,
          entry_id,
          data_ids,
          data,
          transaction_id: transactionId,
        },
      },
      {
        name: "batchDataUpdate",
        duration: 1000,
        limit: 10,
      }
    );
  }

  /**
   * 删除多条数据接口
   */
  async batchDataRemove(app_id, entry_id, data_ids: string[]) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "batch_delete",
        payload: {
          app_id,
          entry_id,
          data_ids,
        },
      },
      {
        name: "batchDataRemove",
        duration: 1000,
        limit: 10,
      }
    );
  }
}

export const workflowApiClient = new WorkFlowApiClient("v5");
