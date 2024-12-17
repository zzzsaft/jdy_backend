import { format } from "date-fns";
import { xftOAApiClient } from "../../../api/xft/xft_oa";
import { BusinessTrip } from "../../../entity/atd/businessTrip";
import { XftTaskEvent } from "../../../controllers/xft/todo.xft.controller";

export class BusinessTripEvent {
  task: XftTaskEvent;

  travelType: string;
  reason: string;
  client: string;
  travelDays: number;
  travelDetailDataDto: any[];

  staffNumber: string;

  businessTripReason: string;
  overtimeLen: number;
  durationUnit: string;
  overtimeType: string;

  constructor(task: XftTaskEvent | null = null) {
    if (!task) {
      this.task = new XftTaskEvent();
      this.task.createTime = new Date().toISOString();
    } else this.task = task;
  }

  async process() {
    await this.getRecord();
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.task.sendUserId);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    const record = await xftOAApiClient.getFormData([this.task.businessParam]);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    record = JSON.parse(record["body"][0]["formData"])["value"];
    this.travelType = record["67e9dc70778511efb83cf1ec159477b2"][0];
    this.client = record["84c0ac70778511efb83cf1ec159477b2"];
    Object.assign(this, record["f1d80fd00f6011eebba9b5713deb8dfa"]);
    this.task.horizontal_content_list = [
      {
        keyname: "出差类型",
        value: this.travelType,
      },
      {
        keyname: "客户名称",
        value: this.client,
      },
      {
        keyname: "出差时长",
        value: this.travelDays.toString(),
      },
    ];
    this.travelDetailDataDto.forEach((item, index) => {
      this.task.horizontal_content_list.push({
        keyname: "出差时间" + (index + 1),
        value: `${item["startDate"]} ${item["startTime"]}至${item["endDate"]} ${item["endTime"]}`,
      });
      this.task.horizontal_content_list.push({
        keyname: "出差地点" + (index + 1),
        value: `${item["departCity"]}-${item["arriveCity"]}`,
      });
    });
    const { earliestDate, latestDate } = getEarliestAndLatestDates(
      this.travelDetailDataDto
    );
    const city = getAllCities(this.travelDetailDataDto);
    await BusinessTrip.addRecordFromXFT({
      xftFormId: this.task.businessParam,
      userId: this.staffNumber,
      startTime: earliestDate,
      endTime: latestDate,
      remark: this.reason,
      reason: this.travelType,
      customer: this.client,
      city: city,
    });
  };

  sendNotice = async (userid: string, status = this.task.status) => {
    let userids = Array.from(new Set([userid, this.task.sendUserId]));
    await this.task.sendNotice(
      userids,
      `(${status})${this.task.title}`,
      format(new Date(this.task.createTime), "yyyy-MM-dd HH:mm")
    );
  };

  sendCard = async () => {
    await this.task.sendButtonCard("");
  };
}
const getDate = (date: string, time: string, begin: boolean) => {
  if (time == "AM" && begin) {
    return new Date(date + "T00:00:00");
  } else if (time == "AM" && !begin) {
    return new Date(date + "T12:00:00");
  } else if (time == "PM" && begin) {
    return new Date(date + "T12:00:00");
  } else if (time == "PM" && !begin) {
    return new Date(date + "T23:59:00");
  }
  return new Date(date + "T" + time);
};
const getEarliestAndLatestDates = (travelDetails) => {
  let earliestDate: Date | null = null; // 设置为 Date 或 null
  let latestDate: Date | null = null; // 设置为 Date 或 null

  for (const detail of travelDetails) {
    const startDate = getDate(detail.startDate, detail.startTime, true);
    const endDate = getDate(detail.endDate, detail.endTime, false);

    if (!earliestDate || startDate < earliestDate) {
      earliestDate = startDate;
    }

    if (!latestDate || endDate > latestDate) {
      latestDate = endDate;
    }
  }
  return {
    earliestDate,
    latestDate,
  };
};
const getAllCities = (travelDetails) => {
  const cities: string[] = [];

  for (const detail of travelDetails) {
    // 添加 arriveCity 和 departCity 到 cities 数组
    if (detail.arriveCity) {
      cities.push(detail?.arriveCity);
    }
    if (detail.departCity) {
      cities.push(detail?.departCity);
    }
  }

  return cities;
};
