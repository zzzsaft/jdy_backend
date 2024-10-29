import { format } from "date-fns";
import { XftTaskEvent } from "../todo.xft.controller";
import { XftAtdOvertime } from "../../../entity/atd/xft_overtime";
import { xftatdApiClient } from "../../../api/xft/xft_atd";
import { XftAtdReissue } from "../../../entity/atd/xft_reissue";
import { User } from "../../../entity/basic/employee";
import { Department } from "../../../entity/basic/department";
import { xftOAApiClient } from "../../../api/xft/xft_oa";
import { atdClassService } from "../../../services/fbt/atdClass.services";
import { getDifference } from "../../../utils/dateUtils";

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
      await this.sendNotice(this.staffNbr);
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
    let flag = false;
    const user = await User.findOne({ where: { user_id: this.staffNbr } });
    if (!user) return false;
    if (user.attendance == "1") {
      const operate = await xftOAApiClient.operate(
        this.task.operateConfig("reject")
      );
      this.task.status = "已驳回";
      this.task.horizontal_content_list.push({
        keyname: "驳回原因",
        value: `暂不支持提交补卡申请，请提供出勤证明至人事部处理`,
      });
      await this.sendNotice(this.staffNbr);
      return true;
    }
    const workTimes = await atdClassService.getClassWorkTime(this.classesSeq);
    for (const time of workTimes) {
      let diff = getDifference(time, this.time);
      if (diff < 30) {
        flag = true;
        break;
      }
    }
    if (flag) {
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
      await this.sendNotice(this.staffNbr);
      return true;
    }
    return false;
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
