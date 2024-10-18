import _ from "lodash";
import { appApiClient, connectApiClient } from "./api_client";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSaturday,
  isSunday,
  startOfMonth,
  subMonths,
} from "date-fns";

export type importAtd = {
  staffName: string;
  staffNumber: string;
  clickDate: string;
  clickTime: string;
  remark: string;
  workPlace: string;
  importNum: number;
};

type RealTimeAttendanceStaQuery = {
  scheduleClass?: "0" | "1"; // 0-全部 1-已出勤 2-未出勤
  scheduleRest?: "0" | "1"; // 0-全部 1-已出勤 2-休息
  noScheduleClass?: "0" | "1"; // 0-全部
  freeTime?: "0" | "1"; // 0-全部 1-自由工时
  clock?: "0"; // 0-全部
};

type RealTimeAttendanceBizQuery = {
  atdBiz?: "1" | "2" | "3" | "4"; // 1-请假 2-加班 3-外出 4-出差
  atdAbnormal?: "1" | "2" | "3" | "4" | "5" | "6"; // 1-迟到 2-早退 3-缺卡 4-加班超时 5-加班未完成 6-加班未报销
};

type AttendanceRequest = {
  attendanceDate: string; // 考勤日期 (格式: yyyy-MM-dd)
  staffNameOrNumber?: string; // 姓名或者员工工号
  organizationSeq?: string; // 部门号
  atdGroupSeq?: string; // 考勤组号
  classSeq?: string; // 班次号
  realTimeAttendanceStaQuery?: RealTimeAttendanceStaQuery; // 统计区域
  realTimeAttendanceBizQuery?: RealTimeAttendanceBizQuery; // 业务区域
};

class XFTAttendanceApiClient {
  async importAtd(payload: importAtd[]) {
    const chunkedList = _.chunk(payload, 900);
    let err: any[] = [];
    for (const chunk of chunkedList) {
      const result = await this._importAtd(chunk);
      err = err.concat(result["body"]);
    }
    return err;
  }
  private async _importAtd(payload: importAtd[]) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/click/import-batch",
        payload,
      },
      "U0000"
    );
  }
  async getLeaveRecord(leaveRecSeq) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/leave/record-query/detail",
      payload: {
        leaveRecSeq,
      },
    });
  }
  async getOvertimeRecord(serialNumber) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/overtime/record-query",
      payload: {
        serialNumber,
      },
    });
  }
  async getBusinessTripRecord(payload: {
    businessSeq?: string;
    staffNameOrStaffNumber?: string;
  }) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/business-trip/query",
      payload,
    });
  }
  async getReissueRecord(serialNumber: string) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/reissue-card/record-query",
      payload: { serialNumber },
    });
  }
  async getAtdType() {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/leave/type-query",
      payload: {},
    });
  }
  async addLeave(payload) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/leave/record-add",
        payload,
      },
      "U0000"
    );
  }
  async addOvertime(payload: {
    staffName: string;
    staffNumber: string;
    overtimeDate: string;
    beginTime: string;
    beginTimeType: string;
    endTime: string;
    endTimeType: string;
    overtimeReason: string;
  }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/overtime/import-single",
        payload,
      },
      "U0000"
    );
  }
  async getQuota(startDate: string, endDate: string, userid: string = "") {
    let totalRecord: any[] = [];
    const init = (await this._getQuota(1, startDate, endDate, userid))["body"];
    const maxPage = Math.ceil(init["totalSize"] / 1000);
    totalRecord = totalRecord.concat(init["records"]);
    for (let i = 2; i <= maxPage; i++) {
      totalRecord = totalRecord.concat(
        (await this._getQuota(i, startDate, endDate, userid))["body"]["records"]
      );
    }
    return totalRecord;
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

    if (quotaThisMonth?.["deservedBal"] != 5 || this.getLastMouthSaturday())
      return {
        total: quotaThisMonth?.["initialBal"],
        left: quotaThisMonth?.["leftBal"],
      };
    const totalBal = this.getLast2MouthSaturday();
    const left = Math.max(0, totalBal - quotaLastMonth?.["usedBal"] || 0);
    const currentMonthLeft = left > 5 ? 5 : left;

    return { total: 5, left: currentMonthLeft - quotaThisMonth?.["usedBal"] };
  }
  async getSingleDayOffQuotaLeftByUserId(userid: string) {
    let quota = await xftatdApiClient.getQuota(
      format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
      format(endOfMonth(new Date()), "yyyy-MM-dd"),
      userid
    );
    quota = quota.filter((item) => item.stfNumber == userid);
    return this.getSingleDayOffQuotaLeft(quota);
  }
  async getAllSingleDayOffQuotaLeft() {
    const quota = await xftatdApiClient.getQuota(
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
  private async _getQuota(
    currentPage: number,
    startDate: string,
    endDate: string,
    userid: string
  ) {
    const payload = {
      currentPage: currentPage,
      lveTypes: ["CUST16"],
      effectiveStartDateBegin: startDate,
      effectiveStartDateEnd: endDate,
      pageSize: 1000,
      stfStatusList: ["0", "1", "3"],
    };
    if (userid) {
      payload["stfNameOrStfNumber"] = userid;
    }
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/leave/find-balance",
        payload,
      },
      "U0000"
    );
  }

  private getLastMouthSaturday = () => {
    const days = eachDayOfInterval({
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date()),
    });

    const saturdays = days.filter(isSaturday).length;
    const sundays = days.filter(isSunday).length;

    if (saturdays == sundays) return true;
    else return false;
  };

  // 返回最近两个月的周六总数量
  private getLast2MouthSaturday = () => {
    const currentDate = new Date();

    // 获取上个月的开始和结束日期
    const startLastMonth = startOfMonth(subMonths(currentDate, 1));
    const endLastMonth = endOfMonth(subMonths(currentDate, 1));

    // 获取本月的开始和结束日期
    const startThisMonth = startOfMonth(currentDate);
    const endThisMonth = endOfMonth(currentDate);

    // 获取上个月的所有天数
    const daysOfLastMonth = eachDayOfInterval({
      start: startLastMonth,
      end: endLastMonth,
    });

    // 获取本月的所有天数
    const daysOfThisMonth = eachDayOfInterval({
      start: startThisMonth,
      end: endThisMonth,
    });

    // 筛选出上个月和本月的周六
    const saturdaysOfLastMonth = daysOfLastMonth.filter((day) =>
      isSaturday(day)
    );
    const saturdaysOfThisMonth = daysOfThisMonth.filter((day) =>
      isSaturday(day)
    );

    // 返回最近两个月的周六总数量
    return saturdaysOfLastMonth.length + saturdaysOfThisMonth.length;
  };
  async getRealTimeAtd(payload: AttendanceRequest) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/realtime-attendance/open-api-query",
        payload,
      },
      "U0000"
    );
  }
  /**
   * 考勤类型 1-固定班 2-排班 3-自由工时
   * @param payload
   * @returns {body:[{attendanceGroupBaseInfoDtoList:{groupName,groupSeq}}]}
   */
  async getAttendanceGroup(payload: { groupType: string }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/attendance-group/query",
        payload,
      },
      "U0000"
    );
  }
}
export const xftatdApiClient = new XFTAttendanceApiClient();
