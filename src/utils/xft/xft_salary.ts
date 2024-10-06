import { format } from "date-fns";
import { appApiClient, connectApiClient } from "./api_client";

class XFTSalaryApiClient {
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
    date
  ) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/sal/sal/xft-sly/salary/api/import-adjust-record",
        payload: {
          salaryRecordDataList: [
            {
              lineId: "1",
              staffName,
              staffNumber,
              adjustType: adjustType,
              afterSalaryDataJson: JSON.stringify(salary),
              adjustSalaryReason: reason,
              effectDate: date,
            },
          ],
        },
      },
      "U0000"
    );
  }
  async setSalary(name, userid, base, date = format(new Date(), "yyyy-MM-dd")) {
    await this._updateSalary(
      name,
      userid,
      "定薪",
      "定薪",
      { IT0002: base },
      date
    );
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
