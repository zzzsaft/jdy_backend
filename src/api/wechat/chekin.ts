import _ from "lodash";
import { ICheckinOption } from "../../type/wechat/IOption";
import { ApiClient } from "./api_client";
import { token_checkin } from "./token";

export type HardwareCheckinData = {
  userid: string;
  unix_checkin_time: number;
  checkin_time: Date;
  device_sn: string;
  device_name: string;
}[];

class CheckinApiClient extends ApiClient {
  splitDatesIntoContinuousIntervals(
    startDate: Date,
    endDate: Date
  ): [number, number][] {
    const intervals: [number, number][] = [];
    let currentStartDate = new Date(startDate.getTime());

    // 确保开始日期早于结束日期
    if (startDate > endDate) {
      throw new Error("Start date must be before end date.");
    }

    // 生成连续的日期区间
    while (currentStartDate < endDate) {
      let currentEndDate = new Date(currentStartDate.getTime());
      currentEndDate.setDate(currentEndDate.getDate() + 29); // 结束日期为开始日期+30天

      // 如果当前结束日期超过了最终结束日期，则将结束日期设置为endDate
      if (currentEndDate > endDate) {
        currentEndDate = new Date(endDate.getTime());
      }

      // 添加当前区间
      intervals.push([
        Math.floor(currentStartDate.getTime() / 1000),
        Math.floor(currentEndDate.getTime() / 1000),
      ]);

      // 下一个区间的开始日期为当前结束日期
      currentStartDate = new Date(currentEndDate.getTime());
    }
    return intervals;
  }
  async getHardwareCheckinData(
    userList: string[],
    startTime: Date,
    endTime: Date
  ): Promise<HardwareCheckinData> {
    let result: HardwareCheckinData = [];
    const intervals = this.splitDatesIntoContinuousIntervals(
      startTime,
      endTime
    );
    for (const interval of intervals) {
      const data = await this._getAllUsersHardwareCheckinData(
        userList,
        interval[0],
        interval[1]
      );
      result = result.concat(data);
    }
    return result;
  }
  private async _getAllUsersHardwareCheckinData(
    userList: string[],
    startTime: number,
    endTime: number
  ): Promise<HardwareCheckinData> {
    const groupedUserList = _.chunk(userList, 100);
    const result: HardwareCheckinData = [];
    for (const userListChunk of groupedUserList) {
      const checkin_data = await this._getHardwareCheckinData({
        useridlist: userListChunk,
        starttime: startTime,
        endtime: endTime,
      });
      if (checkin_data) {
        for (const data of checkin_data["checkindata"]) {
          const date = new Date(data.checkin_time * 1000);
          result.push({
            userid: data.userid,
            unix_checkin_time: data.checkin_time,
            checkin_time: date,
            device_sn: data.device_sn,
            device_name: data.device_name,
          });
        }
      }
    }
    return result;
  }
  private async _getHardwareCheckinData(options: ICheckinOption) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/hardware/get_hardware_checkin_data",
        payload: {
          ...options,
        },
        query: {
          access_token: await token_checkin.get_token(),
        },
      },
      {
        name: "get_hardware_checkin_data",
        duration: 1000,
        limit: 20,
      }
    );
  }
  async getCheckinData(options: ICheckinOption) {
    return await this.doRequest(
      {
        method: "POST",
        path: "/cgi-bin/checkin/getcheckindata",
        payload: {
          opencheckindatatype: 3,
          ...options,
        },
        query: {
          access_token: await token_checkin.get_token(),
        },
      },
      {
        name: "getcheckindata",
        duration: 1000,
        limit: 600,
      }
    );
  }
}
export const checkinApiClient = new CheckinApiClient();
