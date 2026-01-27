import { ILimitOpion } from "../../../type/IType";
import { IFormData } from "../type/IData";
import {
  IDataCreateOption,
  IDataUpdateOption,
  IDatasCreateOption,
  IDataQueryOption,
} from "../type/IOptions";
import { ApiClient } from "./api_client";

const FORM_DATA_BASE_PATH = "app/entry/data/";

const jdyDict = {
  旧_离职申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "5d6f47cfa1d9c3578ccb6043",
  },
  离职申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "6580fbeabeab377a1508c1a1",
  },
  员工档案: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "6414573264b9920007c82491",
  },
  加班申请表: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "64ccdcf9a03b0f000875fcde",
  },
  奖罚申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "65029fdb90a93800071c22db",
  },
  "奖罚申请（批量）": {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "65026a1b41606f00080315b8",
  },
  转正审批: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "5c862c6e2444081a3681f651",
  },
  入职申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "5cfef54d0fc84505a1d270f4",
  },
  澄江离职流程: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "6580fb9014e09eec3dc7a150",
  },
  新前离职流程: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "6581656ed377c4471bba6768",
  },
  调岗申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "64b0e2e9662a0e000853edc8",
  },
  住房公积金: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "640eab4c943d4800083be723",
  },
  加班异常处理: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "65057c5274ed7e000732dfa7",
  },
  请假申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "64cd0135ed93c0000a3bf072",
  },
  部门信息: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "64ae39f26539200009d018ef",
  },
  补卡申请: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "65a3f4504fd8460626989bfc",
  },
  入职情况汇报: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "6461e857cecad50008ce15c3",
  },
  薪资表: {
    appid: "659e53729b4d587a5c95f75b",
    entryid: "659e6935f9d3d50ea578b0d0",
  },
  薪资确认单: {
    appid: "659e53729b4d587a5c95f75b",
    entryid: "65ac0d89a777807dd0fcc143",
  },
  车辆信息登记: {
    appid: "5cd65fc5272c106bbc2bbc38",
    entryid: "668cf9e8bb998350eae3bae6",
  },
  出差信息填报: {
    appid: "5cfef4b5de0b2278b05c8380",
    entryid: "65dc463c9b200f9b5e3b5851",
  },
};

class FormDataApiClient extends ApiClient {
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

  getFormId(formName: keyof typeof jdyDict) {
    return jdyDict[formName];
  }

  /**
   * 新建单条数据接口
   */
  async singleDataCreate({
    app_id,
    entry_id,
    data,
    options = {},
  }: {
    app_id: string;
    entry_id: string;
    data: IFormData;
    options: IDataCreateOption;
  }) {
    return await this.doRequest(
      {
        method: "POST",
        path: FORM_DATA_BASE_PATH + "create",
        payload: {
          app_id,
          entry_id,
          data,
          ...options,
        },
      },
      {
        name: "singleDataCreate",
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

export const jdyFormDataApiClient = new FormDataApiClient("v5");
