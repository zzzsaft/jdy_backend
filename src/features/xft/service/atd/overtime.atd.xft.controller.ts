import { addDays, format, isBefore, parse } from "date-fns";
import { XftAtdOvertime } from "../../../../entity/atd/xft_overtime.js";
import { getDifference } from "../../../../utils/dateUtils.js";
import { XftTaskEvent } from "../../controller/todo.xft.controller.js";
import { xftatdApiClient } from "../../api/xft_atd.js";
import { xftOAApiClient } from "../../api/xft_oa.js";

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

  private isCancelOvertime() {
    return (
      this.task.businessParam?.startsWith("CANOT_") ||
      this.task.details?.includes("流程类型：取消加班")
    );
  }

  async process() {
    await this.getRecord();
    if (!this.isCancelOvertime() && (await this.rejectOA())) return;
    if (this.task.dealStatus == "1") {
      await this.sendNotice(this.stfNumber);
    } else if (this.task.dealStatus == "0") {
      await this.sendCard();
    }
  }

  getRecord = async () => {
    const leaveRecSeq = this.task.businessParam.split("_").pop();
    if (this.isCancelOvertime()) {
      this.proceedCancelRecord();
      return;
    }
    const record = await xftatdApiClient.getOvertimeDetail(leaveRecSeq);
    await this.proceedRecord(record);
  };

  proceedRecord = async (record) => {
    const recordResponseDto = record?.["body"]?.["recordResponseDto"];
    const detailResponseDto = record?.["body"]?.["detailResponseDto"];
    if (!recordResponseDto || !detailResponseDto) {
      throw new Error(
        `加班详情为空，businessParam=${this.task.businessParam}, serialNumber=${this.task.businessParam
          .split("_")
          .pop()}, returnCode=${record?.["returnCode"] ?? ""}, errorMsg=${
          record?.["errorMsg"] ?? ""
        }`
      );
    }
    Object.assign(this, recordResponseDto);
    Object.assign(this, detailResponseDto);
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
        value: `${Number(this.overtimeLen).toFixed(1)} ${
          this.durationUnit == "0" ? "小时" : "分钟"
        }`,
      },
      {
        keyname: "加班原因",
        value: this.remark,
      },
    ];
    await XftAtdOvertime.addRecord(
      recordResponseDto,
      detailResponseDto
    );
  };

  proceedCancelRecord = () => {
    this.stfNumber = this.task.sendUserId;
    const details = this.task.details ?? "";
    const applicant = details.match(/申请人：([^，]+)/)?.[1];
    const overtimeType = details.match(/加班类型：([^，]+)/)?.[1];
    const timeRange = details.match(
      /起止时间：(\d{4}-\d{2}-\d{2} \d{2}:\d{2})-(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/
    );
    const reason = details.match(/取消原因：([^，]*)/)?.[1];
    this.task.horizontal_content_list = [
      { keyname: "流程类型", value: "取消加班" },
      ...(applicant ? [{ keyname: "申请人", value: applicant }] : []),
      ...(overtimeType ? [{ keyname: "加班类型", value: overtimeType }] : []),
      ...(timeRange
        ? [
            { keyname: "开始时间", value: timeRange[1] },
            { keyname: "结束时间", value: timeRange[2] },
          ]
        : []),
    ];
    if (reason) {
      this.task.horizontal_content_list.push({
        keyname: "取消原因",
        value: reason,
      });
    }
  };

  rejectOA = async () => {
    if (isBefore(new Date(this.beginDate), new Date(this.overtimeDate))) {
      return await this._rejectOA(
        `您申请的加班日期为${this.overtimeDate},加班开始时间为${this.beginDate}` +
          ` ${this.beginTime},请注意加班时间应选择当日，如果确定加班时间为昨日，请联系HR添加。`
      );
    }
    if (this.beginDate == this.overtimeDate) {
      const flag = getDifference(this.beginTime, "05:30");
      if (flag && flag > 0 && this.overtimeLen < 6) {
        let startDate = format(
          addDays(new Date(this.overtimeDate), -1),
          "yyyy-MM-dd"
        );
        return await this._rejectOA(
          `如果您本日工作开始为${startDate}晚上,应申请${startDate}为加班日期` +
            `加班时间选择次日，如果确定加班日期为${this.overtimeDate}，请联系HR添加。`
        );
      }
    }
    return false;
  };

  _rejectOA = async (reason) => {
    const operate = await xftOAApiClient.operate(
      this.task.operateConfig("reject", reason)
    );
    if (operate["returnCode"] != "SUC0000") return false;
    if (this.task.dealStatus == "1") return true;
    this.task.status = "已驳回";
    this.task.horizontal_content_list.push({
      keyname: "驳回原因",
      value: reason,
    });
    await this.sendNotice(this.stfNumber);
    return true;
  };

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
