import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { format } from "date-fns";
import { XftAtdOvertime } from "../../../entity/atd/xft_overtime";
import { xftOAApiClient } from "../../../api/xft/xft_oa";
import { BusinessTrip } from "../../../entity/atd/businessTrip";
import { XftTaskEvent } from "../../../controllers/xft/todo.xft.controller";

export class OutGoingEvent {
  task: XftTaskEvent;

  sponsorName: string;
  sponsorNbr: string;
  applyReson: string;
  beginTime: string;
  endTime: string;

  constructor(task: XftTaskEvent | null = null) {
    if (!task) {
      this.task = new XftTaskEvent();
      this.task.createTime = new Date().toISOString();
    } else this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.sponsorNbr);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    const leaveRecSeq = this.task.businessParam.split("_").pop();
    const record = await xftatdApiClient.getOutRecord(leaveRecSeq);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    Object.assign(this, record["body"]["outgoing"]);
    this.task.horizontal_content_list = [
      {
        keyname: "申请人",
        value: this.sponsorName,
      },
      {
        keyname: "出差事由",
        value: this.applyReson,
      },
      {
        keyname: "开始时间",
        value: this.beginTime,
      },
      {
        keyname: "结束时间",
        value: this.endTime,
      },
    ];
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
