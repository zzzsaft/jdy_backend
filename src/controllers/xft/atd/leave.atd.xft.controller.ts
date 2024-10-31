import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

import _ from "lodash";
import { XftAtdLeave } from "../../../entity/atd/xft_leave";
import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { xftOAApiClient } from "../../../api/xft/xft_oa";
import { XftTaskEvent } from "../todo.xft.controller";
import { User } from "../../../entity/basic/employee";
import { quotaServices } from "../../../services/xft/quotaServices";

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
  quota: {
    total: any;
    left: any;
  };
  constructor(task: XftTaskEvent) {
    this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await User.getLeaderId(this.stfNumber);
      await this.sendNotice([this.stfNumber]);
    } else if (this.task.dealStatus == "0") {
      if (await this.rejectOA()) {
        return;
      }
      if (this.task.details.includes("请假类型：轮休假")) {
        if (await this.passOA()) {
          await this.sendNotice([this.task.receiverId]);
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
    if (this.quota.total != 5) return false;
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

  rejectOA = async () => {
    const org = await User.getOrg(this.stfNumber);
    if (org && org.level3 == "加工中心" && org.level1 != "配件事业部") {
      if (this.begDate != this.endDate) {
        const operate = await xftOAApiClient.operate(
          this.task.operateConfig(
            "reject",
            `请假开始时间与结束时间不一致，请重新提交。`
          )
        );
        this.task.status = "已驳回";
        this.task.horizontal_content_list.push({
          keyname: "驳回原因",
          value:
            `不符合请假规则，提交${this.begDate}上午申请则代表请假19:30-次日凌晨1:30，` +
            `提交${this.begDate}下午申请则代表请假次日凌晨1:30-次日上午7:30，如需要请全天班，` +
            `请提交${this.begDate}上午-下午假勤申请`,
        });
        await this.sendNotice([this.task.receiverId]);
        return true;
      }
    }
    if (this.task.details.includes("请假类型：轮休假")) {
      const quota = await quotaServices.getSingleDayOffQuotaLeftByUserId(
        this.stfNumber
      );
      this.quota = quota;
      if (quota.total != 5) return false;
      if (quota.left < 0) {
        const operate = await xftOAApiClient.operate(
          this.task.operateConfig(
            "reject",
            `本月还剩${quota.left}日轮休假，请查看近两月请假记录。如有疑问请联系人力资源部。`
          )
        );
        this.task.status = "已驳回";
        this.task.horizontal_content_list.push({
          keyname: "驳回原因",
          value: `本月还剩${quota.left}日轮休假，请查看近两月请假记录。如有疑问请联系人力资源部。`,
        });
        await this.sendNotice([this.task.receiverId]);
        return true;
      }
    }
  };

  sendNotice = async (userid: string[], status = this.task.status) => {
    let userids = Array.from(new Set([...userid, this.task.sendUserId]));
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
