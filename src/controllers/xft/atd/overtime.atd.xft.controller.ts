import { format, isBefore } from "date-fns";
import { XftTaskEvent } from "../todo.xft.controller";
import { XftAtdOvertime } from "../../../entity/atd/xft_overtime";
import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { xftOAApiClient } from "../../../api/xft/xft_oa";

export class OvertimeEvent {
  task: XftTaskEvent;
  stfNumber: string;
  beginDate: string;
  beginTime: string;
  endDate: string;
  endTime: string;
  remark: string;
  overtimeLen: number;
  durationUnit: string;
  overtimeType: string;
  overtimeDate: string;

  constructor(task: XftTaskEvent) {
    this.task = task;
  }

  async process() {
    await this.getRecord();
    if (await this.rejectOA()) return;
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.stfNumber);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    const leaveRecSeq = this.task.businessParam.split("_").pop();
    const record = await xftatdApiClient.getOvertimeRecord(leaveRecSeq);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    Object.assign(this, record["body"]["recordResponseDto"]);
    Object.assign(this, record["body"]["detailResponseDto"]);
    let overtimeType = {
      "0": "工作日",
      "1": "休息日",
      "2": "节假日",
    };
    this.task.horizontal_content_list = [
      {
        keyname: "加班类型",
        value: overtimeType[this.overtimeType],
      },
      {
        keyname: "开始时间",
        value: `${this.beginDate} ${this.beginTime}`,
      },
      {
        keyname: "结束时间",
        value: `${this.endDate} ${this.endTime}`,
      },
      {
        keyname: "加班时长",
        value: `${this.overtimeLen.toFixed(1)} ${
          this.durationUnit == "0" ? "小时" : "分钟"
        }`,
      },
      {
        keyname: "加班原因",
        value: this.remark,
      },
    ];
    await XftAtdOvertime.addRecord(
      record["body"]["recordResponseDto"],
      record["body"]["detailResponseDto"]
    );
  };

  rejectOA = async () => {
    if (isBefore(new Date(this.beginDate), new Date(this.overtimeDate))) {
      const operate = await xftOAApiClient.operate(
        this.task.operateConfig("reject")
      );
      if (this.task.dealStatus == "1") return true;
      this.task.status = "已驳回";
      this.task.horizontal_content_list.push({
        keyname: "驳回原因",
        value: `您申请的加班日期为${this.overtimeDate},加班开始时间为${this.beginDate} ${this.beginTime},请注意加班时间应选择当日，如果确定加班时间为昨日，请联系HR添加。`,
      });
      await this.sendNotice(this.stfNumber);
      return true;
    }
    return false;
  };

  // rejectOA = async () => {};

  sendNotice = async (userid: string = "", status = this.task.status) => {
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
