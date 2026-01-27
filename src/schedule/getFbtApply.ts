import {
  addDays,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { FbtApply } from "../features/fbt/entity/fbt_trip_apply";
import { Between, IsNull } from "typeorm";
import { BusinessTrip } from "../entity/atd/businessTrip";
import { logger } from "../config/logger";
import { BusinessTripServices } from "../features/xft/service/businessTripServices";
import { FbtApplyService } from "../features/fbt/service/fbtApplyService";

export class GetFbtApply {
  startTime: Date;
  endTime: Date;

  constructor(startTime = addDays(new Date(), -1), endTime = new Date()) {
    this.startTime = startTime;
    this.endTime = endTime;
  }

  async getApply() {
    try {
      const applies = await FbtApplyService.syncFbtApplies(
        this.startTime,
        this.endTime
      );
      for (const applyDb of applies) {
        const applyWithRelations = await FbtApply.getDbApplyWithCityUser(
          applyDb.id
        );
        await BusinessTripServices.createBusinessTrip(applyWithRelations);
      }
    } catch (error) {
      logger.error("Error fetching apply data:", error);
    }
  }

  static async syncMissingXftTrips(options?: {
    date?: Date;
    month?: Date;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { startDate, endDate } = GetFbtApply.resolveSyncRange(options);
    const where: {
      xftBillId: ReturnType<typeof IsNull>;
      xftFormId: ReturnType<typeof IsNull>;
      start_time?: ReturnType<typeof Between>;
    } = {
      xftBillId: IsNull(),
      xftFormId: IsNull(),
    };
    if (startDate && endDate) {
      where.start_time = Between(startDate, endDate);
    }
    const trips = await BusinessTrip.find({
      where,
      order: { start_time: "ASC" },
    });
    for (const trip of trips) {
      if (!trip.fbtCurrentId) {
        logger.warn(`BusinessTrip ${trip.id} missing fbtCurrentId`);
        continue;
      }
      const apply = await FbtApply.findOne({
        where: { id: trip.fbtCurrentId },
        relations: ["city", "user"],
      });
      if (!apply) {
        logger.warn(`FbtApply not found for ${trip.fbtCurrentId}`);
        continue;
      }
      await BusinessTripServices.添加xft差旅记录(trip, apply);
    }
  }

  private static resolveSyncRange(options?: {
    date?: Date;
    month?: Date;
    startDate?: Date;
    endDate?: Date;
  }) {
    if (!options) return { startDate: null, endDate: null };
    if (options.date) {
      return {
        startDate: startOfDay(options.date),
        endDate: endOfDay(options.date),
      };
    }
    if (options.month) {
      return {
        startDate: startOfMonth(options.month),
        endDate: endOfMonth(options.month),
      };
    }
    if (options.startDate && options.endDate) {
      return {
        startDate: startOfDay(options.startDate),
        endDate: endOfDay(options.endDate),
      };
    }
    return { startDate: null, endDate: null };
  }
}

export class XftTripLog {
  fbtApply: FbtApply;
  logTrip: BusinessTrip | undefined;
  err: string | undefined;
  private constructor(apply?: FbtApply, logTrip?: BusinessTrip) {
    if (apply) this.fbtApply = apply;
    if (logTrip) this.logTrip = logTrip;
  }

  async processPastData() {
    await this.process();
  }

  async processPrecisionIssueData() {
    await this.process();
  }

  async process() {
    if (!this.fbtApply) return;
    await BusinessTripServices.createBusinessTrip(this.fbtApply);
  }

  static async importLogbyId(id: string) {
    return new XftTripLog(await FbtApply.getDbApplyWithCityUser(id));
  }
  static importLogbyApply(apply: FbtApply) {
    return new XftTripLog(apply);
  }

  static async 修改xft差旅记录(apply: FbtApply, logTrip: BusinessTrip) {
    return BusinessTripServices.修改xft差旅记录(
      logTrip,
      apply,
      logTrip.start_time,
      logTrip.end_time
    );
  }
}
