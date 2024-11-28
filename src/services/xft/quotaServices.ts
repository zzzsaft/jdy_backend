import { startOfMonth, subMonths, endOfMonth, format } from "date-fns";
import _ from "lodash";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import {
  getLast2MouthSaturday,
  getMouthSaturday,
  getSaturdaySunday,
} from "../../utils/dateUtils";
import { restOvertimeServices } from "../jdy/restOvertimeServices";

class QuotaServices {
  private async getQuota(
    startDate: string,
    endDate: string,
    userid: string = ""
  ) {
    let totalRecord: any[] = [];
    const init = (
      await xftatdApiClient.getQuota(1, startDate, endDate, userid)
    )["body"];
    const maxPage = Math.ceil(init["totalSize"] / 1000);
    totalRecord = totalRecord.concat(init["records"]);
    for (let i = 2; i <= maxPage; i++) {
      totalRecord = totalRecord.concat(
        (await xftatdApiClient.getQuota(i, startDate, endDate, userid))["body"][
          "records"
        ]
      );
    }
    return totalRecord;
  }
  async getAllSingleDayOffQuotaLeft() {
    const quota = await this.getQuota(
      format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
      format(endOfMonth(new Date()), "yyyy-MM-dd")
    );
    const result = _(quota)
      .filter((item) => item.stfNumber) // 过滤掉 stfNumber 为空的项
      .groupBy("stfNumber") // 按 stfNumber 分组
      .mapValues((items) => this.getSingleDayOffQuotaLeft(items)) // 获取每个分组的项目
      .pickBy((value) => value.left !== null && value.left !== 0)
      .value();
    return result;
  }
  async getSingleDayOffQuotaLeftByUserId(userid: string) {
    let quota = await this.getQuota(
      format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
      format(endOfMonth(new Date()), "yyyy-MM-dd"),
      userid
    );
    quota = quota.filter((item) => item.stfNumber == userid);
    const restOvertime = await restOvertimeServices.count(new Date(), userid);
    const result = this.getSingleDayOffQuotaLeft(quota);
    result["left"] = result["left"] - restOvertime;
    return result;
  }
  private getSingleDayOffQuotaLeft(quotas) {
    const currentMonth = format(new Date(), "yyyyMM");
    const lastMonth = format(subMonths(new Date(), 1), "yyyyMM");
    const quotaLastMonth = quotas.find(
      (quota) => quota["balPeriod"] == lastMonth
    );
    const quotaThisMonth = quotas.find(
      (quota) => quota["balPeriod"] == currentMonth
    );

    let thisMouthSaturday = getMouthSaturday();
    let lastMouthSaturday = getMouthSaturday(subMonths(new Date(), -1));
    if (quotaThisMonth?.["deservedBal"] == 10)
      return {
        total: getSaturdaySunday(),
        left: getSaturdaySunday() - quotaThisMonth?.["usedBal"],
      };
    if (
      quotaThisMonth?.["deservedBal"] != 5 ||
      thisMouthSaturday == 5
      // ||
      // (thisMouthSaturday != 4 && lastMouthSaturday == 4)
    )
      return {
        total: quotaThisMonth?.["initialBal"],
        left: quotaThisMonth?.["leftBal"],
      };
    if (getMouthSaturday() == 4) {
      return {
        total: quotaThisMonth?.["initialBal"],
        left: parseFloat(quotaThisMonth?.["leftBal"]) - 1,
      };
    }
    const totalBal = getLast2MouthSaturday();
    const left = Math.max(0, totalBal - quotaLastMonth?.["usedBal"] || 0);
    const currentMonthLeft = left > 5 ? 5 : left;

    return { total: 5, left: currentMonthLeft - quotaThisMonth?.["usedBal"] };
  }
}
export const quotaServices = new QuotaServices();
