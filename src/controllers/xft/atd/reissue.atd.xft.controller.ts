import { format } from "date-fns";
import { XftTaskEvent } from "../todo.xft.controller";
import { XftAtdOvertime } from "../../../entity/atd/xft_overtime";
import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { XftAtdReissue } from "../../../entity/atd/xft_reissue";

export class ReissueEvent {
  task: XftTaskEvent;

  supplementCardType: string;
  date: string;
  time: string;
  publicPrivateType: string;
  staffNbr: string;
  remark: string;
  useSupplementCardNumber: number;

  constructor(task: XftTaskEvent) {
    this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.staffNbr);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    const serialNumber = this.task.businessParam.split("_").pop() ?? "";
    const record = await xftatdApiClient.getReissueRecord(serialNumber);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    Object.assign(this, record["body"]["supplementCard"]);
    this.supplementCardType =
      { "1": "上班补卡", "2": "下班补卡" }[this.supplementCardType] ??
      "其他补卡";
    this.publicPrivateType =
      { "1": "因公", "2": "因私" }[this.publicPrivateType] ?? "";
    this.task.horizontal_content_list = [
      {
        keyname: "补卡类型",
        value: this.supplementCardType,
      },
      {
        keyname: "补卡日期",
        value: `${this.date} ${this.time}`,
      },
      {
        keyname: "补卡原因",
        value: `${this.remark}(${this.publicPrivateType})`,
      },
      {
        keyname: "本月补卡次数",
        value: this.useSupplementCardNumber.toString(),
      },
    ];
    await XftAtdReissue.addRecord({
      ...record["body"]["supplementCard"],
      ...this,
    });
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
