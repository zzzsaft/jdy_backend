import _ from "lodash";
import { appApiClient, connectApiClient } from "./api_client";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSaturday,
  isSunday,
  startOfMonth,
  subMonths,
} from "date-fns";
import { getLast2MouthSaturday, getMouthSaturday } from "../../utils/dateUtils";

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
  async getClass() {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/atd-class/query-class-detail",
        payload: {},
      },
      "U0000"
    );
  }
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
  async getLeaveDetail(leaveRecSeq) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/leave/record-query/detail",
      payload: {
        leaveRecSeq,
      },
    });
  }
  async getLeaveRecord(
    stfNumber,
    begDate: Date = addDays(new Date(), -1),
    endDate: Date = addDays(new Date(), 2)
  ) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/leave/record-query",
      payload: {
        begDate: format(begDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        stfNumber,
        pageNo: 1,
        pageSize: 1000,
      },
    });
  }
  async getOvertimeRecord(beginDate, endDate, userid) {
    const payload = {
      currentPage: 1,
      pageSize: 1000,
      beginDate,
      endDate,
    };
    if (userid) {
      payload["applicantNumber"] = userid;
    }
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-ovt/overtime-data/query",
      payload,
    });
  }
  async getOvertimeDetail(serialNumber) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/overtime/record-query",
      payload: {
        serialNumber,
      },
    });
  }
  async getOutRecord(serialNumber) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/go-out/record-query",
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
  async addOutData(
    payload: {
      staffNumber: string;
      staffName: string;
      appModule: "D" | "M";
      atdDate: Date;
      item: { itemName: string; itemValue: string | number }[];
    }[]
  ) {
    for (const item of payload) {
      item["atdCycle"] =
        item.appModule == "D"
          ? format(item.atdDate, "yyyy-MM-dd")
          : format(item.atdDate, "yyyyMM");
      item["excelTitle"] = item.item.map((item) => item.itemName);
    }
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/out-data/import",
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
        payload: {
          ...payload,
          compensationWay: "2",
        },
      },
      "U0000"
    );
  }
  async getQuota(
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
  async getDayResult(payload: {
    attendanceDate: string;
    staffNumber?: string;
  }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/atd/prd/xft-atn/sta-result/day/query",
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
