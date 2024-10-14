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
import { getHalfDay } from "../../utils/dateUtils";

export type importAtd = {
  staffName: string;
  staffNumber: string;
  clickDate: string;
  clickTime: string;
  remark: string;
  workPlace: string;
  importNum: number;
};

class XFTItripApiClient {
  async createApplyTravel({
    outRelId,
    empNumber,
    reason,
    peerEmpNumbers,
    departCityCode,
    destinationCityCode,
    start_time,
    end_time,
  }) {
    return this._createApplyTravel({
      eventNumber: "01240921022004000001",
      outRelId,
      empNumber,
      billStatus: "APPRV",
      peerEmpNumbers,
      customFieldValues: [
        {
          fieldNumber: "reason",
          fieldValue: reason,
        },
      ],
      businessTrip: {
        businessTripDetails: [
          {
            departCityCode,
            destinationCityCode,
            beginTime: format(start_time, "yyyy-MM-dd HH:mm"),
            endTime: format(end_time, "yyyy-MM-dd HH:mm"),
            beginTimePrecision: getHalfDay(start_time),
            endTimePrecision: getHalfDay(end_time),
            tripReason: reason,
          },
        ],
      },
    });
  }

  async _createApplyTravel(payload: {
    eventNumber: string;
    outRelId?: string;
    empNumber: string;
    billStatus: "DRAFT" | "APPRV";
    customFieldValues: { fieldNumber: string; fieldValue: string }[];
    businessTrip: {
      businessTripDetails: {
        departCityCode: string;
        destinationCityCode: string;
        beginTime: string;
        endTime: string;
        beginTimePrecision: string;
        endTimePrecision: string;
        tripReason?: string;
      }[];
    };
    peerEmpNumbers?: string[];
  }) {
    return await appApiClient.doRequest(
      {
        method: "POST",
        path: "/itrip/xft-api/v1/bills/apply/travel/create",
        payload,
      },
      "U0000"
    );
  }
  async getAllCity() {
    return await appApiClient.doRequest({
      method: "GET",
      path: "/itrip/xft-api/v1/common/city/getAllCity",
      query: { OPAUID: "AAA00512" },
    });
  }
  async getApplyTravelDetail(billId) {
    return await appApiClient.doRequest({
      method: "GET",
      path: "/itrip/xft-api/v1/bills/apply/travel/detail",
      query: { billId },
    });
  }
  async updateApplyTravel(
    payload
    //   : {
    //   billId: number;
    //   changerNumber: string;
    //   peerEmpNumbers?: string[];
    //   changeReason: string;
    //   changeInfo: {
    //     customFieldValues?: { fieldNumber: string; fieldValue: string }[];
    //     businessTrip: {
    //       businessTripDetails: {
    //         departCityCode: string;
    //         destinationCityCode: string;
    //         beginTime: string;
    //         endTime: string;
    //         beginTimePrecision: string;
    //         endTimePrecision: string;
    //         tripReason?: string;
    //       }[];
    //     };
    //   };
    // }
  ) {
    return await appApiClient.doRequest({
      method: "POST",
      path: "/itrip/xft-api/v1/bills/apply/travel/change",
      payload,
    });
  }
}
export const xftItripApiClient = new XFTItripApiClient();
