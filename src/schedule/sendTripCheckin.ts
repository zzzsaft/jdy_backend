import { xftOAApiClient } from "../utils/xft/xft_oa";
import { LogTripSync } from "../entity/common/log_trip_sync";
import { log } from "console";
import { LessThan, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { XftTripCheckin } from "../entity/xft/tripCheckin";
import { FbtApply } from "../entity/fbt/apply";
import { format } from "date-fns";

type busData = {
  // value: {
  tripId: string;
  //   tripUser: { NAME: string; CODE: string };
  date: number;
  reason: string;
  name: string;
  serviceId: string;
  // };
  //   mapping: [];
};

export class SendTripCheckin {
  constructor() {}

  static async createBatchTripCheckin(date: Date = new Date()) {
    const logTripSync = await LogTripSync.find({
      where: {
        start_time: MoreThanOrEqual(date),
        end_time: LessThanOrEqual(date),
      },
    });
    for (const item of logTripSync) {
      await this.createTripCheckin(item, date);
    }
  }

  static async createByRootId(fbtRootId: string, date: Date = new Date()) {
    const logTrip = await LogTripSync.findOne({ where: { fbtRootId } });
    if (logTrip) await this.createTripCheckin(logTrip, date);
  }

  private static async createTripCheckin(
    logTripSync: LogTripSync,
    date: Date = new Date()
  ) {
    const sendTripCheckin = new SendTripCheckin();
    if (logTripSync.start_time > date || logTripSync.end_time < date) {
      const checkin = await XftTripCheckin.addRecord({
        userId: logTripSync.userId,
        fbtRootId: logTripSync.fbtRootId,
        checkinDate: logTripSync.start_time,
      });
      if (!checkin) return;
      const busData = await sendTripCheckin.generateBusData(checkin);
      if (!busData) return;
      const result = await sendTripCheckin.startTrial(checkin.xftId, busData);
      if (result && result["returnCode"] == "SUC0000") {
        checkin.state = "未打卡";
        await checkin.save();
      }
    }
  }

  async generateBusData(checkin: XftTripCheckin): Promise<busData | null> {
    const apply = await FbtApply.findOne({
      where: { root_id: checkin.fbtRootId },
      order: { create_time: "DESC" },
    });
    if (!apply) return null;
    return {
      name: apply.remark,
      tripId: checkin.id.toString(),
      //   tripUser: {
      //     NAME: checkin.name,
      //     CODE: checkin.userId,
      //   },
      serviceId: apply.serviceNumber ?? "",
      date: checkin.checkinDate.getTime(),
      reason: apply.reason ?? "商务洽谈",
    };
  }

  async startTrial(startId: string, busData: busData) {
    return await xftOAApiClient.runApi("cd7b9611667244a7a7", {
      starterId: startId,
      procKey: "FORM_AAA00512_PX7732d530840a4851adPX",
      data: busData,
    });
  }
}
