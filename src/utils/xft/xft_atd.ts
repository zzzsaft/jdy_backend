import _ from "lodash";
import { appApiClient, connectApiClient } from "./api_client";

export type importAtd = {
  staffName: string;
  staffNumber: string;
  clickDate: string;
  clickTime: string;
  remark: string;
  workPlace: string;
  importNum: number;
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
  async getBusinessTripRecord(businessSeq) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/business-trip/query",
      payload: {
        businessSeq,
      },
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
    return await appApiClient.doRequest({
      method: "POST",
      path: "/atd/prd/xft-atn/leave/record-add",
      payload,
    });
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
}
export const xftatdApiClient = new XFTAttendanceApiClient();
