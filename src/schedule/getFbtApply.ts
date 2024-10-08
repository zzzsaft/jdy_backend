import { addDays, format } from "date-fns";
import { fbtApplyApiClient } from "../utils/fenbeitong/apply";
import { FbtApply } from "../entity/fbt/apply";
import { Between } from "typeorm";
import _ from "lodash";
import { xftItripApiClient } from "../utils/xft/xft_itrip";
import { XftCity } from "../entity/xft/city";
import { User } from "../entity/wechat/User";
import { LogTripSync } from "../entity/common/log_trip";
import { logger } from "../config/logger";

export class GetFbtApply {
  startTime: Date;
  endTime: Date;

  constructor(startTime = addDays(new Date(), -1), endTime = new Date()) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.getApply().then(() => {});
  }

  private async getApply() {
    try {
      const apply = await this._getApply();
      const unexistApply = await this._calculateUnexistApply(apply);
      for (const code of unexistApply) {
        const record = await GetFbtApply.getApplyDetail(code);
        await this._addToDB(record);
        await 添加xft差旅记录(apply);
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
    if (!apply.parent_id) return;
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
  }
}

class XftTripLog {
  fbtApply: FbtApply;
  logTrip: LogTripSync;

  private constructor(id?: string, apply?: FbtApply) {
    if (apply) {
      this.fbtApply = apply;
    } else if (id) {
      FbtApply.getDbApplyWithCityUser(id).then((apply) => {
        this.fbtApply = apply;
      });
    }
  }

  async getLog() {
    const logTrip = await LogTripSync.findOne({
      where: { fbtRootId: this.fbtApply.root_id },
    });
  }

  async _generateLog(): Promise<LogTripSync> {
    const timeSlot = await this.createNonConflictingTimeSlot(
      this.fbtApply.start_time,
      this.fbtApply.end_time,
      this.fbtApply.proposerUserId
    );
    const logTrip = new LogTripSync();
    logTrip.fbtRootId = this.fbtApply.root_id;
    logTrip.fbtCurrentId = this.fbtApply.id;
    logTrip.create_time = this.fbtApply.create_time;
    logTrip.start_time = timeSlot.start_time;
    logTrip.end_time = timeSlot.end_time;
    return logTrip;
  }

  private async createNonConflictingTimeSlot(_start_time, _end_time, _userId) {
    const start_time = new Date(_start_time);
    const end_time = new Date(_end_time);
    const conflicts = await LogTripSync.getConflict(
      _userId,
      start_time,
      end_time
    );
    if (conflicts.length > 0) {
      // 处理冲突并生成新的时间段
      let newStartTime = start_time;
      let newEndTime = end_time;

      for (const conflict of conflicts) {
        if (
          conflict.start_time <= newEndTime &&
          conflict.end_time >= newStartTime
        ) {
          // 如果输入的时间段和数据库记录有重叠
          if (conflict.end_time < newEndTime) {
            // 调整开始时间，避免与冲突记录重叠
            newStartTime = new Date(conflict.end_time.getTime() + 1 * 1000); // 冲突的结束时间 + 1秒
          }
          if (conflict.start_time > newStartTime) {
            // 调整结束时间，避免与冲突记录重叠
            newEndTime = new Date(conflict.start_time.getTime() - 1 * 1000); // 冲突的开始时间 - 1秒
          }
        }
      }
      return { start_time: newStartTime, end_time: newEndTime };
    }
    // 如果没有冲突，则直接返回原始的时间段
    return { start_time, end_time };
  }

  static importLogbyId(id: string) {
    return new XftTripLog(id);
  }
  static importLogbyApply(apply: FbtApply) {
    return new XftTripLog(undefined, apply);
  }
}

const 修改xft差旅记录 = async (apply: FbtApply) => {};

export const 添加xft差旅记录 = async (apply: FbtApply) => {
  if (apply.state != 4) return;
  const exist = await LogTripSync.exists({
    where: { fbtRootId: apply.root_id },
  });
  if (!exist) {
    const billid = await _添加xft差旅记录(apply);
    await LogTripSync.addRecord(
      apply.root_id,
      apply.id,
      billid,
      apply.create_time
    );
  }
};

const _添加xft差旅记录 = async (fbtApply: FbtApply) => {
  if (fbtApply.city.length < 2) {
    return { error: fbtApply.city.map((city) => city.name).join(",") };
  }
  let applier;
  if (fbtApply.user.map((user) => user.fbtId).includes(fbtApply.proposer_id)) {
    applier = fbtApply.proposerUserId.slice(0, 20);
  } else {
    applier = fbtApply.user[0].userId.slice(0, 20);
  }
  if (!applier) return { error: "no applier" };
  const departCityCode =
    (await XftCity.findOne({ where: { cityName: fbtApply.city[0].name } }))
      ?.cityCode ?? "96";
  const destinationCityCode =
    (await XftCity.findOne({ where: { cityName: fbtApply.city[1].name } }))
      ?.cityCode ?? "1";
  const cities = fbtApply.city.map((city) => {
    return city.name;
  });
  const result = await xftItripApiClient.createApplyTravel({
    eventNumber: "01240921022004000001",
    outRelId: fbtApply.id,
    empNumber: applier,
    customFieldValues: [
      {
        fieldNumber: "reason",
        fieldValue: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(",")}`,
      },
    ],
    billStatus: "APPRV",
    businessTrip: {
      businessTripDetails: [
        {
          departCityCode,
          destinationCityCode,
          beginTime: format(new Date(fbtApply.start_time), "yyyy-MM-dd HH:mm"),
          endTime: format(new Date(fbtApply.end_time), "yyyy-MM-dd HH:mm"),
          beginTimePrecision:
            new Date(fbtApply.start_time).getHours() < 12 ? "AM" : "PM",
          endTimePrecision:
            new Date(fbtApply.end_time).getHours() < 12 ? "AM" : "PM",
          tripReason: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(
            ","
          )}`,
        },
      ],
    },
    peerEmpNumbers: fbtApply.user
      .map((user) => user.userId)
      .filter((user) => user != applier),
  });
  if (result["returnCode"] == "SUC0000") return { billId: result["body"] };
  else return { error: result };
};

const _修改xft差旅记录 = async () => {};

const 每日获取订单 = async () => {};
