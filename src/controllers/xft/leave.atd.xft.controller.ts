import { xftatdApiClient } from "../../utils/xft/xft_atd";
import { xftOAApiClient } from "../../utils/xft/xft_oa";
import { XftTaskEvent } from "./todo.xft.controller";
import { format } from "date-fns";
import { XftAtdLeave } from "../../entity/xft/leave";

export class LeaveEvent {
  task: XftTaskEvent;
  title: string;
  staffName: string;
  stfNumber: string;
  lveTypeName: string;
  lveType: string;
  begDate: string;
  begTime: string;
  endDate: string;
  endTime: string;
  leaveDuration: string;
  lveUnit: string;
  createTime: string;
  passTime: string;
  leaveDays: string;
  leaveBeginDate: string;
  leaveEndDate: string;
  leaveReason: string;
  leaveDtlDtos: string[];
  constructor(task: XftTaskEvent) {
    this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.stfNumber);
    } else if (this.task.dealStatus == "0") {
      if (this.task.details.includes("请假类型：轮休假")) {
        if (await this.passOA()) {
          await this.sendNotice(this.task.receiverId);
        } else {
          await this.sendCard();
        }
      } else {
        await this.sendCard();
      }
    }
  }

  getRecord = async () => {
    const leaveRecSeq = this.task.businessParam.split("_").pop();
    const record = await xftatdApiClient.getLeaveRecord(leaveRecSeq);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    Object.assign(this, record["body"]);
    this.task.horizontal_content_list = [
      { keyname: "请假类型", value: this.lveTypeName },
      {
        keyname: "开始时间",
        value: `${this.begDate} ${this.begTime} (${this.getDay(this.begDate)})`,
      },
      {
        keyname: "结束时间",
        value: `${this.endDate} ${this.endTime} (${this.getDay(this.endDate)})`,
      },
      {
        keyname: "请假时长",
        value: `${this.leaveDuration} ${this.lveUnit == "DAY" ? "天" : "小时"}`,
      },
    ];
    if (this.leaveReason) {
      this.task.horizontal_content_list.push({
        keyname: "请假原因",
        value: this.leaveReason,
      });
    }
    await XftAtdLeave.addRecord(record["body"]);
  };

  passOA = async () => {
    if (this.leaveDtlDtos) {
      const isWeekend = this.leaveDtlDtos.every(
        (dtos) => dtos["weekDay"] == 1 || dtos["weekDay"] == 7
      );
      if (isWeekend) {
        const operate = await xftOAApiClient.operate(
          this.task.operateConfig("pass")
        );
        if (operate["returnCode"] == "SUC0000") {
          this.task.status = "已自动通过";
          return true;
        }
      }
    }
    return false;
  };

  rejectOA = async () => {};

  sendNotice = async (userid: string, status = this.task.status) => {
    let userids = Array.from(new Set([userid, this.task.sendUserId]));
    await this.task.sendNotice(
      userids,
      `(${status})${this.title}`,
      format(new Date(this.createTime), "yyyy-MM-dd HH:mm")
    );
  };

  sendCard = async () => {
    await this.task.sendButtonCard("");
  };

  getDay(date: string) {
    // 映射英文星期到中文
    const daysMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return daysMap[new Date(date).getDay()];
  }
}
