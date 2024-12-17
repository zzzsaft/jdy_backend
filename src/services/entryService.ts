import { LessThanOrEqual } from "typeorm";
import { logger } from "../config/logger";
import { XftAtdLeave } from "../entity/atd/xft_leave";
import { XftAtdOut } from "../entity/atd/xft_out";
import { BusinessTrip } from "../entity/atd/businessTrip";
import { xftatdApiClient } from "../api/xft/xft_atd";
import { addDays, format } from "date-fns";
import { atdClassService } from "./fbt/atdClass.services";
import { isBeforeTime } from "../utils/dateUtils";
import { MessageHelper } from "../api/wechat/message";
import { AbnomalTraffic } from "../entity/log/abnormal_traffic";
import { User } from "../entity/basic/employee";

export class Traffic {
  traffic: AbnomalTraffic;
  userTimeout: NodeJS.Timeout;
  leaderTimeout: NodeJS.Timeout;
  hrTimeout: NodeJS.Timeout;
  constructor(
    public id: number,
    public date: Date,
    public userid: string,
    public name: string
  ) {
    this.id = id;
    this.date = date;
    this.userid = userid;
    this.name = name;
  }
  load = async (traffic: AbnomalTraffic) => {
    this.traffic = traffic;
    if (!(await this.validWorkTime())) return;
    if (!(await this.validApproval())) return;
    if (!traffic.userSent) this.startUserTimeout();
    if (!traffic.leaderSent) this.startLeaderTimeout();
    if (!traffic.hrSent) this.startHrTimeout();
  };
  startTimeout = async () => {
    if (this.userTimeout) return;
    if (!(await this.validWorkTime())) return;
    if (!(await this.validApproval())) return;
    await this.addtoDb();
    this.startUserTimeout();
    this.startLeaderTimeout();
    this.startHrTimeout();
  };
  clearTimeout = () => {
    if (this.userTimeout) clearTimeout(this.userTimeout);
    if (this.leaderTimeout) clearTimeout(this.leaderTimeout);
    if (this.hrTimeout) clearTimeout(this.hrTimeout);
  };
  addInDate = async (date: Date) => {
    this.traffic.inDate = date;
    this.traffic.interval = Math.abs(date.getTime() - this.date.getTime());
    await this.traffic.save();
    this.clearTimeout();
  };
  test = async () => {
    this.userTimeout = setTimeout(() => {
      try {
        this.sendMessagetoUser();
      } catch (error) {
        logger.error(error);
      }
    }, 5 * 1000);
  };
  private startUserTimeout = () => {
    // 15分钟后发送消息给用户
    this.userTimeout = setTimeout(() => {
      try {
        this.sendMessagetoUser();
      } catch (error) {
        logger.error(error);
      }
    }, 15 * 60 * 1000);
  };
  private startLeaderTimeout = () => {
    // 25分钟后发送消息给领导
    this.leaderTimeout = setTimeout(() => {
      try {
        this.sendMessagetoLeader();
      } catch (error) {
        logger.error(error);
      }
    }, 25 * 60 * 1000);
  };
  private startHrTimeout = () => {
    // 30分钟后发送消息给HR
    this.hrTimeout = setTimeout(() => {
      try {
        this.sendMessagetoHr();
      } catch (error) {
        logger.error(error);
      }
    }, 30 * 60 * 1000);
  };
  private sendMessagetoUser = async () => {
    if (await this.validApproval()) return;
    this.traffic.userSent = true;
    await this.traffic.save();
    new MessageHelper([this.userid]).send_plain_text(
      `温馨提示：\n` +
        `您于本日${format(
          this.date,
          "yyyy-MM-dd HH:mm"
        )}离开公司，但系统未查询到您的请假或外出记录。\n` +
        `如有相关申请，请在10分钟内提交或及时返回公司，否则该出门记录将会通知至您部门负责人，并可能导致旷工，请知悉并及时处理。`
    );
  };
  private sendMessagetoLeader = async () => {
    if (await this.validApproval()) return;
    const leader = await User.getLeaderId(this.userid);
    new MessageHelper(leader).sendButtonCard({
      event: {
        eventId: this.traffic.id.toString(),
        eventType: "traffic",
      },
      main_title: {
        title: "异常出门提醒",
        desc: format(this.date, "yyyy-MM-dd HH:mm"),
      },
      sub_title_text: `员工${this.name}于${format(
        this.date,
        "yyyy-MM-dd HH:mm"
      )}离开公司，但系统未查询到请假或外出记录。`,
      button_list: [
        {
          text: "未知",
          key: JSON.stringify({
            id: this.traffic.id,
            type: "unknown",
          }),
          style: 2,
        },
        {
          text: "已请假或外出",
          key: JSON.stringify({
            id: this.traffic.id,
            type: "approved",
          }),
          style: 1,
        },
      ],
    });
    this.traffic.leaderSent = true;
    await this.traffic.save();
  };
  private sendMessagetoHr = async () => {
    if (await this.validApproval()) return;
    if (this.traffic.approvalType) return;
    new MessageHelper(["ZhengJie"]).send_plain_text(
      `${this.name}于本日${format(
        this.date,
        "yyyy-MM-dd HH:mm"
      )}离开公司，但系统未查询到请假或外出记录。\n` + `请确认该员工是否离岗`
    );
    this.traffic.hrSent = true;
    await this.traffic.save();
  };

  private addtoDb = async () => {
    this.traffic = new AbnomalTraffic();
    this.traffic.userid = this.userid;
    this.traffic.entryId = this.id;
    this.traffic.outDate = this.date;
    this.traffic.name = this.name;
    this.traffic = await this.traffic.save();
  };
  private validWorkTime = async () => {
    const baseDate = isBeforeTime(this.date, "7:30")
      ? addDays(this.date, -1)
      : this.date;
    const data = await xftatdApiClient.getRealTimeAtd({
      attendanceDate: format(baseDate, "yyyy-MM-dd"),
      staffNameOrNumber: this.userid,
    });
    if (data.returnCode != "SUC0000") {
      throw new Error(`获取实时考勤信息失败${this.userid} ${data}`);
    }
    const className =
      data["body"]["realTimeAttendanceDetailDtoList"][0]["className"];
    return await atdClassService.validWorkTime(className, this.date, baseDate);
  };
  private validApproval = async () => {
    if (
      (await this.validLeave()) ||
      (await this.validOut()) ||
      (await this.validTravel())
    ) {
      this.clearTimeout();
      return true;
    }
    return false;
  };
  private validLeave = async () => {
    const flag = await XftAtdLeave.findOne({
      where: {
        userId: this.userid,
        begDate: LessThanOrEqual(this.date),
        endDate: LessThanOrEqual(this.date),
      },
    });
    if (flag) {
      this.changeTrafficType("请假");
      return true;
    }
    return false;
  };
  private validOut = async () => {
    const flag = await XftAtdOut.exists({
      where: {
        userId: this.userid,
        beginTime: LessThanOrEqual(this.date),
        endTime: LessThanOrEqual(this.date),
      },
    });
    if (flag) {
      this.changeTrafficType("外出");
      return true;
    }
    return false;
  };
  private validTravel = async () => {
    const flag = await BusinessTrip.exists({
      where: {
        userId: this.userid,
        start_time: LessThanOrEqual(this.date),
        end_time: LessThanOrEqual(this.date),
      },
    });
    if (flag) {
      this.changeTrafficType("出差");
      return true;
    }
    return false;
  };
  private changeTrafficType = async (type: string) => {
    if (!this.traffic) return;
    this.traffic.approvalType = type;
    await this.traffic.save();
  };
  updateTrafficComment = async (type) => {
    if (!this.traffic) return;
    this.traffic.approvalType = type == "confirm" ? "领导已确认" : "";
    await this.traffic.save();
  };
}

class TrafficService {
  traffics: Map<string, Traffic> = new Map<string, Traffic>();
  async addOut(id: number, date: Date, userid: string, name: string) {
    const traffic = new Traffic(id, date, userid, name);
    await traffic.startTimeout();
    this.traffics.set(userid, traffic);
  }
  async addIn(userid: string, date: Date) {
    const traffic = this.traffics.get(userid);
    if (traffic) {
      await traffic.addInDate(date);
      this.traffics.delete(userid);
    }
  }
  async leaderConfirm({ id, type }) {
    const traffic = this.traffics.get(id);
    if (traffic) await traffic.updateTrafficComment(type);
    else await AbnomalTraffic.update({ id }, { approvalType: type });
  }
}

export const trafficService = new TrafficService();
