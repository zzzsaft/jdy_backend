import { xftatdApiClient } from "../../../utils/xft/xft_atd";
import { XftTaskEvent } from "../todo.xft.controller";
import { format } from "date-fns";
import { XftAtdOvertime } from "../../../entity/xft/overtime";
import { xftOAApiClient } from "../../../utils/xft/xft_oa";

export class BusinessTripEvent {
  task: XftTaskEvent;

  reason: string;
  client: string;
  travelDays: number;
  travelDetailDataDto: any[];

  stfNumber: string;

  beginDate: string;
  endDate: string;

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
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.stfNumber);
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
    this.reason = record["67e9dc70778511efb83cf1ec159477b2"];
    this.client = record["84c0ac70778511efb83cf1ec159477b2"];
    Object.assign(this, record["f1d80fd00f6011eebba9b5713deb8dfa"]);
    this.task.horizontal_content_list = [
      {
        keyname: "出差类型",
        value: this.reason,
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
    // await XftAtdOvertime.addRecord(
    //   record["body"]["recordResponseDto"],
    //   record["body"]["detailResponseDto"]
    // );
  };

  // passOA = async () => {
  //   const operate = await xftOAApiClient.operate(
  //     this.task.operateConfig("pass")
  //   );
  // };

  rejectOA = async () => {};

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
