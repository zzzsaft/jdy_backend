import { format } from "date-fns";
import { appApiClient, connectApiClient } from "./api_client";

class XFTSalaryApiClient {
  async setAtd() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/sal/sal/xft-sly/data-collection/third-party-data-collection/third-party-field-collection",
      payload: {
        // basicInfo: {
        //   enterpriseId: "AAA00512",
        //   dataSourceName: "O",
        // },
        // fieldList: {
        //   // "52111": "班次",
        // },
      },
    });
  }
  async setAtd1() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/sal/sal/xft-sly/data-collection/third-party-data-collection/third-party-data-collection",
      payload: {
        dataList: {
          staffName: "梁之",
          staffId: "0000000001",
          data: {
            "52111": "",
          },
        },
        basicInfo: {
          dimension: "202410",
          groupId: "000000000001",
          startDate: "2024-10-21",
          endDate: "2024-10-21",
        },
      },
    });
  }
  async getSalaryHead() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/sal/sal/xft-sly/salary/api/query-adjust-head",
    });
  }
  async getSalaryDoc(staffName: string) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/sal/sal/xft-sly/salary/api/query-salary-file",
        payload: {
          pageInfo: {
            pageNumber: "1",
            pageSize: "1000",
          },
          salaryFileQueryCondition: {
            staffName,
          },
        },
      },
      "U0000"
    );
  }
  private async _updateSalary(
    staffName: string,
    staffNumber: string,
    adjustType: "定薪" | "调薪",
    reason,
    salary,
    date?
  ) {
    const salaryRecordDataList = [
      {
        lineId: "1",
        staffName,
        staffNumber,
        adjustType: adjustType,
        afterSalaryDataJson: JSON.stringify(salary),
        adjustSalaryReason: reason,
      },
    ];
    if (date) salaryRecordDataList[0]["effectDate"] = date;
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/sal/sal/xft-sly/salary/api/import-adjust-record",
        payload: {
          salaryRecordDataList,
        },
      },
      "U0000"
    );
  }
  async setSalary(name, userid, base) {
    await this._updateSalary(name, userid, "定薪", "定薪", { IT0002: base });
  }
  async positiveSalary(name, userid, base, month, season, annual, date) {
    await this._updateSalary(
      name,
      userid,
      "调薪",
      "转正薪资",
      { IT0002: base, IT0003: month, IT0010: season, IT0004: annual },
      date
    );
  }
}
export const xftSalaryApiClient = new XFTSalaryApiClient();
