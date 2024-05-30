import { appApiClient, connectApiClient } from "./api_client";

class XftUserApiClient {
  async updateEmployee(staffInfoList) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/hrm/hrm2/xft-employeeprofile/employee/staff-general-api/modify-staff",
        payload: { staffInfoList: staffInfoList },
      },
      {
        name: "updateEmployee",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async getEmployeeDetail(id: string) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/xft-member/openapi/xft-member/member/get/by-id",
        payload: { id: id, extFields: ["external", "personal"] },
      },
      {
        name: "getEmployeeDetail",
        duration: 1000,
        limit: 20,
      }
    );
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
      ],
    }
  ) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/hrm/hrm2/xft-employeeprofile/employee/external/api/query/staffInfo",
        payload: {
          queryFilterList: filterList,
          queryResultType: queryResultType,
          currentPage: page,
          pageSize: 1000,
        },
      },
      {
        name: "getEmployeeList",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async createEmployeeList(staffs: any[]) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/hrm/hrm2/xft-employeeprofile/employee/staffGeneralApi/addStaff",
        payload: staffs,
      },
      {
        name: "createEmployeeList",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async getMemberList() {
    return await appApiClient.doRequest(
      {
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
      },
      {
        name: "createEmployeeList",
        duration: 1000,
        limit: 20,
      }
    );
  }
}
export const xftUserApiClient = new XftUserApiClient();
