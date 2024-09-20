import { appApiClient, connectApiClient } from "./api_client";

class XftUserApiClient {
  //查询企业自定义字段配置
  async getCustomFields() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/hrm/HRCUSFLD",
      payload: {},
    });
  }
  //保存待入职员工
  async saveEmployee(staffInfoList, dataSources = "jdy") {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-employeemovement/entry/save/v1/batch",
      payload: { dataSources: dataSources, entryStaffs: staffInfoList },
    });
  }
  async updateEmployee(staffInfoList) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-employeeprofile/employee/staff-general-api/modify-staff",
      payload: { staffInfoList: staffInfoList },
    });
  }
  async getEmployeeDetail(id: string) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-member/openapi/xft-member/member/get/by-id",
      payload: { id: id, extFields: ["external", "personal"] },
    });
  }

  async getAllEmployeeList() {
    return [
      ...(await this._getEmployeeList(1))["body"]["records"],
      ...(await this._getEmployeeList(2))["body"]["records"],
      ...(await this._getEmployeeList(3))["body"]["records"],
      ...(await this._getEmployeeList(4))["body"]["records"],
    ];
  }

  async getEmployeeList(
    filterList: {
      fieldKey: string;
      fieldQueryMethod: "EQUAL" | "FUZZY" | "RANGE" | "DATE";
      fieldValue: string;
    }[] = [],
    queryResultType: {
      queryType: "FIELD" | "GROUP";
      queryFieldList?: string[];
      queryClassKeyList?: string[];
    } = {
      queryType: "FIELD",
      queryFieldList: [
        "stfSeq",
        "stfNumber",
        "certificateNumber",
        "orgSeq",
        "stfStatus",
        "remark",
      ],
    }
  ) {
    return [
      ...(await this._getEmployeeList(1, filterList, queryResultType))["body"][
        "records"
      ],
      ...(await this._getEmployeeList(2, filterList, queryResultType))["body"][
        "records"
      ],
      ...(await this._getEmployeeList(3, filterList, queryResultType))["body"][
        "records"
      ],
    ];
  }

  private async _getEmployeeList(
    page = 1,
    filterList: {
      fieldKey: string;
      fieldQueryMethod: "EQUAL" | "FUZZY" | "RANGE" | "DATE";
      fieldValue: string;
    }[] = [],
    queryResultType: {
      queryType: "FIELD" | "GROUP";
      queryFieldList?: string[];
      queryClassKeyList?: string[];
    } = {
      queryType: "FIELD",
      queryFieldList: [
        "stfSeq",
        "stfNumber",
        "certificateNumber",
        "orgSeq",
        "stfStatus",
        "remark",
      ],
    }
  ) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-employeeprofile/employee/external/api/query/staffInfo",
      payload: {
        queryFilterList: filterList,
        queryResultType: queryResultType,
        currentPage: page,
        pageSize: 1000,
      },
    });
  }
  async createEmployeeList(staffs: any[]) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-employeeprofile/employee/staffGeneralApi/addStaff",
      payload: staffs,
    });
  }
  async getMemberList() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/xft-member/openapi/usermanage/OPUSRLST",
      payload: {
        OPUSRLSTX: [],
        SYPAGINFY: [
          {
            PAGNBR: 1,
            PGENUM: 2147483647,
          },
        ],
      },
    });
  }
  async getMapping(STFSEQ) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/hrm/hrm2/xft-hmp/HRSTRLQR",
      payload: {
        HRTDSTMPZ: [
          {
            STFSEQ,
          },
        ],
      },
    });
  }
}
export const xftUserApiClient = new XftUserApiClient();
