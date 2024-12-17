import { LessThanOrEqual } from "typeorm";
import { logger } from "../config/logger";
import { XftAtdLeave } from "../entity/atd/xft_leave";
import { XftAtdOut } from "../entity/atd/xft_out";
import { BusinessTrip } from "../entity/atd/businessTrip";
import { xftatdApiClient } from "../api/xft/xft_atd";
import { addDays, format } from "date-fns";
import { XftAtdClass } from "../entity/atd/xft_class";
import { atdClassService } from "./fbt/atdClass.services";
import { isBeforeTime } from "../utils/dateUtils";
import { MessageHelper } from "../api/wechat/message";

export class Entry {
  userTimeout: NodeJS.Timeout;
  leaderTimeout: NodeJS.Timeout;
  hrTimeout: NodeJS.Timeout;
  constructor(public id: number, public date: Date, public userid: string) {
    this.id = id;
    this.date = date;
    this.userid = userid;
  }
  startTimeout = async () => {
    if (this.userTimeout) return;
    if (!(await this.validWorkTime())) return;
    if (!(await this.validApproval())) return;

    // 15分钟后发送消息给用户
    this.userTimeout = setTimeout(() => {
      try {
        this.sendMessagetoUser();
      } catch (error) {
        logger.error(error);
      }
    }, 15 * 60 * 1000);
    // 25分钟后发送消息给领导
    this.leaderTimeout = setTimeout(() => {
      try {
        this.sendMessagetoLeader();
      } catch (error) {
        logger.error(error);
      }
    }, 25 * 60 * 1000);
    // 30分钟后发送消息给HR
    this.hrTimeout = setTimeout(() => {
      try {
        this.sendMessagetoLeader();
      } catch (error) {
        logger.error(error);
      }
    }, 30 * 60 * 1000);
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
  sendMessagetoUser = async () => {
    if (!(await this.validApproval())) return;
    new MessageHelper([this.userid]).send_plain_text(
      `温馨提示：\n` +
        `您于本日${format(
          this.date,
          "yyyy-MM-dd HH:mm"
        )}离开公司，但系统未查询到您的请假或外出记录。\n` +
        `如有相关申请，请在10分钟内提交或及时返回公司，否则该出门记录将会通知至您部门负责人，请知悉并及时处理。`
    );
  };
  sendMessagetoLeader = async () => {
    if (!(await this.validApproval())) return;
  };

  validWorkTime = async () => {
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
      if (this.userTimeout) clearTimeout(this.userTimeout);
      if (this.leaderTimeout) clearTimeout(this.leaderTimeout);
      if (this.hrTimeout) clearTimeout(this.hrTimeout);
      return true;
    }
    return false;
  };
  private validLeave = async () => {
    return await XftAtdLeave.exists({
      where: {
        userId: this.userid,
        begDate: LessThanOrEqual(this.date),
        endDate: LessThanOrEqual(this.date),
      },
    });
  };
  private validOut = async () => {
    return await XftAtdOut.exists({
      where: {
        userId: this.userid,
        beginTime: LessThanOrEqual(this.date),
        endTime: LessThanOrEqual(this.date),
      },
    });
  };
  private validTravel = async () => {
    return await BusinessTrip.exists({
      where: {
        userId: this.userid,
        start_time: LessThanOrEqual(this.date),
        end_time: LessThanOrEqual(this.date),
      },
    });
  };
}

class EntryService {}
