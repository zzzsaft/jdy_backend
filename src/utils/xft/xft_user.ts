import { appApiClient, connectApiClient } from "./api_client";

class XftUserApiClient {
  async getEmployeeList() {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/hrm/hrm2/xft-employeeprofile/employee/external/api/query/staffInfo",
        payload: {
          queryFilterList: [],
          queryResultType: {
            queryType: "FIELD",
            queryFieldList: ["stfNumber", "certificateNumber"],
          },
          currentPage: 1,
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
}
export const xftUserApiClient = new XftUserApiClient();
