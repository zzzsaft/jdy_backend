import { addHours, format, isAfter, isBefore } from "date-fns";
import { XftAtdOvertime } from "../../../entity/atd/xft_overtime";
import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { XftAtdReissue } from "../../../entity/atd/xft_reissue";
import { User } from "../../../entity/basic/employee";
import { Department } from "../../../entity/basic/department";
import { xftOAApiClient } from "../../../api/xft/xft_oa";
import { atdClassService } from "../../../services/fbt/atdClass.services";
import { getDate, getDifference } from "../../../utils/dateUtils";
import { XftAtdClass } from "../../../entity/atd/xft_class";
import { EntryExistRecords } from "../../../entity/parking/dh_entry_exit_record";
import { Between } from "typeorm";
import _ from "lodash";
import { XftTaskEvent } from "../../../controllers/xft/todo.xft.controller";

export class ReissueEvent {
  task: XftTaskEvent;

  supplementCardType: string;
  date: string;
  time: string;
  publicPrivateType: string;
  staffNbr: string;
  remark: string;
  useSupplementCardNumber: number;
  classesSeq: string;

  constructor(task: XftTaskEvent) {
    this.task = task;
  }

  async process() {
    await this.getRecord();
    if (this.task.dealStatus == "1") {
      await this.sendNotice([this.staffNbr]);
    } else if (this.task.dealStatus == "0") {
      if (await this.rejectOA()) return;
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
    const cardType = await atdClassService.getClosedTime(
      this.classesSeq,
      this.time
    );
    if (
      this.supplementCardType == "其他补卡" &&
      (cardType == "1" || cardType == "0")
    ) {
      this.supplementCardType = cardType == "0" ? "上班补卡" : "下班补卡";
    }
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

  rejectOA = async () => {
    const user = await User.findOne({ where: { user_id: this.staffNbr } });

    if (await this.determineReject()) {
      const operate = await xftOAApiClient.operate(
        this.task.operateConfig("reject")
      );
      this.task.status = "已驳回";
      await this.sendNotice([this.staffNbr, this.task.receiverId]);
      return true;
    }

    if (this.supplementCardType == "下班补卡") {
      if (!user) return false;
      const org = await Department.findOne({
        where: { department_id: user.main_department_id },
      });
      if (!org || !(org.level3 == "加工中心" || org.department_id == "70"))
        return false;
      const operate = await xftOAApiClient.operate(
        this.task.operateConfig("reject")
      );
      this.task.status = "已驳回";
      this.task.horizontal_content_list.push({
        keyname: "驳回原因",
        value: `如因生产结束原因提前下班，请在下班时打卡并提交请假【生产带薪假】，未打卡或未提交请假单将会被视为漏卡。`,
      });
      await this.sendNotice([this.staffNbr]);
      return true;
    }
    return false;
  };

  sendNotice = async (userid: string[], status = this.task.status) => {
    let userids = Array.from(new Set([...userid, this.task.sendUserId]));
    await this.task.sendNotice(
      userids,
      `(${status})${this.task.title}`,
      format(new Date(this.task.createTime), "yyyy-MM-dd HH:mm")
    );
  };

  sendCard = async () => {
    await this.task.sendButtonCard("");
  };

  async determineReject() {
    const time = getDate(this.date, this.time, false);
    const cards = await EntryExistRecords.find({
      where: {
        userId: this.staffNbr,
        time: Between(addHours(time, -2), addHours(time, 2)), // 时间范围在补卡时间前1小时内
      },
    });
    if (!cards) return false;
    this.task.horizontal_content_list.push({
      keyname: "出入场记录",
      value: cards
        .map((card) => `${format(card.time, "HH:mm")}[${card.method}]`)
        .join(","),
    });
    /*如果是上班补卡，出入场记录中，有早于补卡时间的记录，
    则通过，如果有晚于补卡时间2小时内的入场记录，
    且在入厂记录之前没有出厂记录，则驳回
    */
    if (this.supplementCardType == "上班补卡") {
      const flag1 =
        cards.filter(
          (card) => card.enterOrExit == 0 && isBefore(card.time, time)
        ).length > 0;
      let flag2 = false;
      const earliestEntry = _.minBy(
        cards.filter(
          (card) =>
            card.enterOrExit === 0 && // 入场记录
            isAfter(card.time, time) // 晚于补卡时间的记录
        ),
        (card) => card.time
      );
      if (earliestEntry) {
        flag2 =
          cards.filter(
            (card) =>
              card.enterOrExit == 1 && isBefore(card.time, earliestEntry.time)
          ).length == 0;
      }
      if (flag1) return false;
      if (flag2) {
        this.task.horizontal_content_list.push({
          keyname: "驳回原因",
          value: `存在晚于补卡时间2小时内的入场记录，但在入场记录之前没有出场记录,请核实。`,
        });
        return true;
      }
    }
    if (this.supplementCardType == "下班补卡") {
      const flag1 =
        cards.filter(
          (card) => card.enterOrExit == 1 && isAfter(card.time, time)
        ).length > 0;
      let flag2 = false;
      const latestLeave = _.maxBy(
        cards.filter(
          (card) =>
            card.enterOrExit === 1 && // 入场记录
            isBefore(card.time, time) // 早于补卡时间的记录
        ),
        (card) => card.time
      );
      if (latestLeave) {
        flag2 =
          cards.filter(
            (card) =>
              card.enterOrExit == 0 && isAfter(card.time, latestLeave.time)
          ).length == 0;
      }
      if (flag1) return false;
      if (flag2) {
        this.task.horizontal_content_list.push({
          keyname: "驳回原因",
          value: `存在早于补卡时间2小时内的出场记录，并且在出场记录之后没有入场记录,请核实。`,
        });
        return true;
      }
    }
    return false;
  }
}
