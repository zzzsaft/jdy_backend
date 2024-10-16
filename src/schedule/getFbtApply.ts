import { addDays, format } from "date-fns";
import { fbtApplyApiClient } from "../api/fenbeitong/apply";
import { FbtApply } from "../entity/atd/fbt_trip_apply";
import { Between } from "typeorm";
import _ from "lodash";
import { xftItripApiClient } from "../api/xft/xft_itrip";
import { XftCity } from "../entity/util/xft_city";
import { User } from "../entity/basic/employee";
import { BusinessTrip } from "../entity/atd/businessTrip";
import { logger } from "../config/logger";
import { log } from "console";
import { MessageHelper } from "../api/wechat/message";
import { getHalfDay } from "../utils/dateUtils";

export class GetFbtApply {
  startTime: Date;
  endTime: Date;

  constructor(startTime = addDays(new Date(), -1), endTime = new Date()) {
    this.startTime = startTime;
    this.endTime = endTime;
  }

  async getApply() {
    try {
      const apply = await this._getApply();
      const unexistApply = await this._calculateUnexistApply(apply);
      for (const code of unexistApply) {
        const record = await GetFbtApply.getApplyDetail(code);
        const applyDb = await this._addToDB(record);
        // if (applyDb) await XftTripLog.importLogbyApply(applyDb).process();
      }
    } catch (error) {
      logger.error("Error fetching apply data:", error);
    }
  }

  private async _getApply() {
    return await fbtApplyApiClient.getCustomFormList({
      approve_start_time: format(this.startTime, "yyyy-MM-dd"),
      approve_end_time: format(this.endTime, "yyyy-MM-dd"),
    });
  }

  private async _calculateUnexistApply(formList) {
    const existCode = (
      await FbtApply.find({
        where: { complete_time: Between(this.startTime, this.endTime) },
        select: ["code"],
      })
    ).map((item) => item.code);
    const result = _.difference(
      formList.map((item) => item.code),
      existCode
    );
    return result;
  }

  static async getApplyDetail(id) {
    const record = await fbtApplyApiClient.getTripDetail(id);
    if (record["code"] === 0) return record["data"]["apply"];
    else {
      throw new Error(
        `GetFbtApply，_getApplyDetail，Error fetching details for id ${id}: ${record["message"]}`
      );
    }
  }

  private async _addToDB(record) {
    //当前数据保存数据库
    const apply = await FbtApply.addApply(record);
    //更新parentid的数据
    let parentApplyState;
    if (!apply.parent_id) return apply;
    parentApplyState = (
      await FbtApply.findOne({
        where: { id: apply.parent_id },
        select: ["state"],
      })
    )?.state;
    if (parentApplyState != 2048) {
      const parentApply = await GetFbtApply.getApplyDetail(apply.parent_id);
      await FbtApply.updateApply(parentApply);
    }
    return apply;
  }
}

export class XftTripLog {
  fbtApply: FbtApply;
  logTrip: BusinessTrip;
  err: string;
  private constructor(apply?: FbtApply, logTrip?: BusinessTrip) {
    if (apply) this.fbtApply = apply;
    if (logTrip) this.logTrip = logTrip;
  }

  async processPastData() {
    const logTrip = await BusinessTrip.findOne({
      where: { fbtRootId: this.fbtApply.root_id },
    });
    this.logTrip = await this._generateLog();
    if (!logTrip || !this.logTrip.start_time || !logTrip.xftBillId) return;
    if (
      this.fbtApply.start_time.getTime() != this.logTrip.start_time.getTime() ||
      this.fbtApply.end_time.getTime() != this.logTrip.end_time.getTime()
    ) {
      await this.修改xft差旅记录(logTrip.xftBillId);
    }
  }

  async processPrecisionIssueData() {
    const logTrip = await BusinessTrip.findOne({
      where: { fbtRootId: this.fbtApply.root_id },
    });
    this.logTrip = await this._generateLog();
    if (!logTrip || !this.logTrip.start_time || !logTrip.xftBillId) return;
    if (
      this.fbtApply.start_time.getTime() != this.logTrip.start_time.getTime() ||
      this.fbtApply.end_time.getTime() != this.logTrip.end_time.getTime()
    ) {
      await this.修改xft差旅记录(logTrip.xftBillId);
    }
  }

  async process() {
    if (this.fbtApply.state != 4) return;
    const logTrip = await BusinessTrip.findOne({
      where: { fbtRootId: this.fbtApply.root_id },
    });
    if (logTrip?.fbtCurrentId == this.fbtApply.id) return;
    this.logTrip = await this._generateLog();
    if (!this.logTrip.start_time || !this.logTrip.end_time) {
      this.logTrip.err = `时间段为空${format(
        this.fbtApply.start_time,
        "yyyy-MM-dd HH:mm"
      )} ${format(this.fbtApply.end_time, "yyyy-MM-dd HH:mm")}`;
      this.logTrip.isSync = false;
      await BusinessTrip.upsert(this.logTrip, {
        conflictPaths: ["fbtRootId"],
        skipUpdateIfNoValuesChanged: true,
      });
      return;
    }
    if (logTrip == null) {
      await this._添加xft差旅记录();
    } else if (
      logTrip.start_time != this.logTrip.start_time ||
      logTrip.end_time != this.logTrip.end_time
    ) {
      await this.修改xft差旅记录(logTrip.xftBillId);
    }
    await BusinessTrip.upsert(this.logTrip, {
      conflictPaths: ["fbtRootId"],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  async _generateLog(): Promise<BusinessTrip> {
    const timeSlot = await this.createNonConflictingTimeSlot(
      this.fbtApply.start_time,
      this.fbtApply.end_time,
      this.fbtApply.proposerUserId,
      this.fbtApply.create_time
    );
    const logTrip = new BusinessTrip();
    logTrip.city = this.fbtApply.city.map((city) => city.name);
    logTrip.userId = this.fbtApply.proposerUserId;
    logTrip.fbtRootId = this.fbtApply.root_id;
    logTrip.fbtCurrentId = this.fbtApply.id;
    logTrip.create_time = this.fbtApply.create_time;
    logTrip.source = "分贝通";
    logTrip.start_time = timeSlot?.start_time ?? (null as any);
    logTrip.end_time = timeSlot?.end_time ?? (null as any);

    return logTrip;
  }
  private async createNonConflictingTimeSlot(
    _start_time,
    _end_time,
    _userId,
    _create_time
  ) {
    const start_time = new Date(_start_time);
    const end_time = new Date(_end_time);
    const create_time = new Date(_create_time);
    const conflicts = (
      await BusinessTrip.getConflict(_userId, start_time, end_time, create_time)
    ).filter((conflict) => conflict.fbtRootId != this.fbtApply.root_id);
    if (conflicts.length > 0) {
      // 处理冲突并生成新的时间段
      let newStartTime = start_time;
      let newEndTime = end_time;

      for (const conflict of conflicts) {
        if (!conflict.start_time || !conflict.end_time) continue;
        if (
          conflict.start_time <= newStartTime &&
          conflict.end_time >= newEndTime
        ) {
          // 如果有冲突记录完全覆盖输入的时间段，则返回null
          return null;
        }

        if (
          conflict.start_time <= newEndTime &&
          conflict.end_time >= newStartTime
        ) {
          // 如果输入的时间段和数据库记录有重叠
          if (conflict.end_time < newEndTime) {
            // 调整开始时间，避免与冲突记录重叠
            newStartTime = this.adjustToTimeNode(
              new Date(conflict.end_time.getTime() + 1 * 1000)
            ); // 冲突的结束时间 + 1秒
          }
          if (conflict.start_time > newStartTime) {
            // 调整结束时间，避免与冲突记录重叠
            newEndTime = this.adjustToTimeNode(
              new Date(conflict.start_time.getTime() - 1 * 1000),
              true
            ); // 冲突的开始时间 - 1秒
          }
        }
      }
      return { start_time: newStartTime, end_time: newEndTime };
    }
    // 如果没有冲突，则直接返回原始的时间段
    return { start_time: this.adjustToTimeNode(start_time), end_time };
  }
  private adjustToTimeNode(date: Date, isEndTime: boolean = false): Date {
    const adjustedDate = new Date(date);

    const hours = adjustedDate.getHours();

    if (isEndTime) {
      // 对结束时间进行调整
      if (hours < 12) {
        // 如果结束时间小于12点，调整到12:00
        adjustedDate.setHours(11, 59, 59, 999);
      } else {
        // 如果结束时间大于12点，调整到23:59
        adjustedDate.setHours(23, 59, 59, 999);
      }
    } else {
      // 对开始时间进行调整
      if (hours < 12) {
        // 如果开始时间小于12点，调整到00:00
        adjustedDate.setHours(0, 0, 0, 0);
      } else {
        // 如果开始时间大于12点，调整到12:00
        adjustedDate.setHours(12, 1, 0, 0);
      }
    }

    return adjustedDate;
  }

  async _添加xft差旅记录() {
    if (!this.logTrip.start_time || !this.logTrip.end_time) {
      this.logTrip.err = `时间段为空${this.fbtApply.start_time} ${this.fbtApply.end_time}`;
      this.logTrip.isSync = false;
      return;
    }
    if (!this.logTrip.userId) {
      this.logTrip.err = `userId为空`;
      this.logTrip.isSync = false;
      return;
    }
    if (
      this.fbtApply.city.length == 1 &&
      this.fbtApply.city[0].name.includes("台州")
    ) {
      this.logTrip.err = "台州";
      this.logTrip.isSync = false;
      return;
    }
    let applier = this.logTrip.userId.slice(0, 20);

    const departCityCode = await this.getCityCode(this.fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (this.fbtApply.city.length > 1) {
      destinationCityCode = await this.getCityCode(this.fbtApply.city[1].name);
    }

    const cities = this.fbtApply.city.map((city) => {
      return city.name;
    });
    const result = await xftItripApiClient.createApplyTravel({
      outRelId: this.fbtApply.root_id,
      empNumber: applier,
      reason: `${this.fbtApply.reason} ${this.fbtApply.remark} ${cities.join(
        ","
      )}`,
      departCityCode,
      destinationCityCode,
      start_time: this.adjustToTimeNode(this.logTrip.start_time, true),
      end_time: this.adjustToTimeNode(this.logTrip.end_time, true),
      peerEmpNumbers: this.fbtApply.user
        .map((user) => user.userId.slice(0, 20))
        .filter((user) => user != applier),
    });
    if (result["returnCode"] == "SUC0000") {
      this.logTrip.isSync = true;
      this.logTrip.err = "";
      this.logTrip.xftBillId = result["body"];
      await this.sendMessages();
    } else {
      this.logTrip.isSync = false;
      this.logTrip.err = result;
    }
  }

  async 修改xft差旅记录(billId) {
    let applier = this.logTrip.userId.slice(0, 20);
    const departCityCode = await this.getCityCode(this.fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (this.fbtApply.city.length > 1) {
      destinationCityCode = await this.getCityCode(this.fbtApply.city[1].name);
    }
    await this._修改xft差旅记录({
      billId,
      changerNumber: applier,
      departCityCode,
      destinationCityCode,
      start_time: this.adjustToTimeNode(this.logTrip.start_time, true),
      end_time: this.adjustToTimeNode(this.logTrip.end_time, true),
    });
  }

  async _修改xft差旅记录({
    billId,
    changerNumber,
    departCityCode,
    destinationCityCode,
    start_time,
    end_time,
  }) {
    const result = await xftItripApiClient.updateApplyTravel({
      billId,
      changerNumber,
      // peerEmpNumbers: [],
      changeReason: "1",
      changeInfo: {
        businessTrip: {
          businessTripDetails: [
            {
              departCityCode,
              destinationCityCode,
              beginTime: format(start_time, "yyyy-MM-dd HH:mm"),
              endTime: format(end_time, "yyyy-MM-dd HH:mm"),
              beginTimePrecision: getHalfDay(start_time),
              endTimePrecision: getHalfDay(end_time),
              // timePrecisionType: "1",
            },
          ],
        },
      },
    });
    if (result["returnCode"] == "SUC0000") {
      this.logTrip.isSync = true;
      this.logTrip.err = "";
      this.sendMessages();
      return true;
    }
    return false;
  }

  private async getCityCode(cityName: string) {
    return (
      await XftCity.findOne({
        where: { cityName: cityName.split("/")[0].split(",")[0] },
      })
    )?.cityCode;
  }

  static async importLogbyId(id: string) {
    return new XftTripLog(await FbtApply.getDbApplyWithCityUser(id));
  }
  static importLogbyApply(apply: FbtApply) {
    return new XftTripLog(apply);
  }

  static async 修改xft差旅记录(apply: FbtApply, logTrip: BusinessTrip) {
    return new XftTripLog(apply, logTrip).修改xft差旅记录(logTrip.xftBillId);
  }

  async sendMessages() {
    if (process.env.NODE_ENV != "production") return;
    const startTime = this.logTrip.start_time;
    const endTime1 = this.logTrip.end_time;
    const beginTime = `${format(startTime, "yyyy-MM-dd")} ${getHalfDay(
      startTime
    )}`;
    const endTime = `${format(endTime1, "yyyy-MM-dd")} ${getHalfDay(endTime1)}`;
    // 发送消息
    new MessageHelper([this.fbtApply.proposerUserId]).sendTextNotice({
      main_title: {
        title: "分贝通差旅同步考勤成功",
        desc: format(new Date(this.fbtApply.create_time), "yyyy-MM-dd HH:mm"),
      },
      sub_title_text: "",
      card_action: {
        type: 1,
        url: "https://xft.cmbchina.com/mobile-atd/#/trip-record",
      },
      horizontal_content_list: [
        {
          keyname: "原因",
          value: this.fbtApply.reason,
        },
        {
          keyname: "出差城市",
          value: this.fbtApply.city.map((city) => city.name).join(", "),
        },
        {
          keyname: "开始时间",
          value: beginTime,
        },
        {
          keyname: "结束时间",
          value: endTime,
        },
      ],
    });
  }
}
