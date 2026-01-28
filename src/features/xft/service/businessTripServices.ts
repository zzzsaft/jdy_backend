import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns";
import {
  adjustToTimeNode,
  formatDate,
  getHalfDay,
} from "../../../utils/dateUtils";
import { BusinessTrip } from "../../../entity/atd/businessTrip";
import { FbtApply } from "../../fbt/entity/fbt_trip_apply";
import { Between, LessThanOrEqual, Like, MoreThanOrEqual } from "typeorm";
import _ from "lodash";
import { MessageService } from "../../../services/messageService";
import { xftatdApiClient } from "../api/xft_atd";

export class BusinessTripServices {
  static async scheduleCreate(date: Date = new Date()) {
    const fbtApplies = await FbtApply.find({
      where: {
        complete_time: Between(startOfDay(date), endOfDay(date)),
        state: 4,
      },
      relations: ["city", "user"],
    });
    for (const item of fbtApplies) {
      await BusinessTripServices.createBusinessTrip(item);
    }
  }

  static async syncFbtAppliesToBusinessTrip(options?: {
    date?: Date;
    month?: Date;
    fbtRootId?: string;
  }) {
    const applies = await BusinessTripServices.getFbtAppliesForSync(options);
    for (const apply of applies) {
      const result = await BusinessTripServices.upsertBusinessTripFromFbt(apply);
      if (!result) continue;
      if (!result.businessTrip.xftBillId) {
        await BusinessTripServices.添加xft差旅记录(
          result.businessTrip,
          apply,
          { skipMessage: true }
        );
      }
    }
  }

  static async upsertBusinessTripFromFbt(fbtApply: FbtApply) {
    const existBusinessTrip = await BusinessTrip.findOne({
      where: { fbtRootId: fbtApply.root_id },
    });
    if (
      existBusinessTrip &&
      existBusinessTrip.fbtCurrentId == fbtApply.id
    ) {
      return { businessTrip: existBusinessTrip, action: "noop" };
    }
    const timeSlot = await BusinessTripServices.createNonConflictingTimeSlot(
      fbtApply
    );
    if (timeSlot) {
      const sameTimeBusinessTrip = await BusinessTrip.findOne({
        where: {
          userId: fbtApply.proposerUserId,
          start_time: LessThanOrEqual(timeSlot.start_time),
          end_time: MoreThanOrEqual(timeSlot.end_time),
        },
      });
      if (sameTimeBusinessTrip) {
        return null;
      }
    }
    const businessTrip = BusinessTripServices.buildBusinessTripFromFbt(
      fbtApply,
      timeSlot,
      existBusinessTrip
    );

    if (!existBusinessTrip) {
      await businessTrip.save();
      return { businessTrip, action: "create" as const };
    }

    const hasChanges =
      businessTrip.start_time?.getTime() <
        existBusinessTrip.start_time?.getTime() ||
      businessTrip.end_time?.getTime() !=
        existBusinessTrip.end_time?.getTime() ||
      !_.isEqual(businessTrip.companion, existBusinessTrip.companion);

    if (hasChanges) {
      const startTime = BusinessTripServices.resolveSyncStartTime(
        existBusinessTrip.start_time,
        businessTrip.start_time
      );
      BusinessTrip.merge(existBusinessTrip, businessTrip);
      await existBusinessTrip.save();
      return {
        businessTrip: existBusinessTrip,
        action: "update" as const,
        startTime,
        endTime: businessTrip.end_time,
      };
    }

    BusinessTrip.merge(existBusinessTrip, businessTrip);
    await existBusinessTrip.save();
    return { businessTrip: existBusinessTrip, action: "refresh" as const };
  }

  static async 添加xft差旅记录(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply,
    options: { skipMessage?: boolean; allowRepair?: boolean } = {}
  ) {
    if (!businessTrip || !fbtApply) return null;
    if (!businessTrip.start_time || !businessTrip.end_time) {
      await businessTrip.save();
      return null;
    }
    if (!businessTrip.userId) {
      businessTrip.err = `userId为空`;
      await businessTrip.save();
      return null;
    }
    if (fbtApply.city.length == 1 && fbtApply.city[0].name.includes("台州")) {
      businessTrip.err = "台州";
      await businessTrip.save();
      return;
    }
    const applier = businessTrip.userId.slice(0, 20);
    if (!applier) {
      businessTrip.err = `userId为空`;
      await businessTrip.save();
      return null;
    }

    const cities = fbtApply.city.map((city) => {
      return city.name;
    });
    const startTime = adjustToTimeNode(businessTrip.start_time, true);
    const endTime = adjustToTimeNode(businessTrip.end_time, true);
    const businessTripLastDays =
      differenceInCalendarDays(endTime, startTime) + 1;
    const businessTripDetail = fbtApply.city.map((city) => ({
      destination: city.name,
      beginDate: format(startTime, "yyyy-MM-dd"),
      beginDateType: getHalfDay(startTime),
      endDate: format(endTime, "yyyy-MM-dd"),
      endDateType: getHalfDay(endTime),
    }));
    const partners = await Promise.all(
      fbtApply.user
        .filter((user) => user.userId && user.userId !== businessTrip.userId)
        .map((user) => {
          const partnerSeq = user.userId?.slice(0, 20);
          if (!partnerSeq) return null;
          return { partnerName: user.name, partnerSeq };
        })
    );
    const result = await xftatdApiClient.addBusinessTrip({
      staffName: fbtApply.proposerUserName ?? fbtApply.proposer_name ?? "",
      staffNumber: applier,
      startPlace: fbtApply.city[0].name,
      roundTrip: "A",
      businessTripLastDays,
      businessTripReason: `${fbtApply.reason ?? ""} ${
        fbtApply.remark ?? ""
      } ${cities.join(",")}`.trim(),
      remark: fbtApply.remark ?? "",
      businessTripPartner: partners.filter(
        (partner): partner is { partnerName: string; partnerSeq: string } =>
          partner != null
      ),
      businessTripDetail,
    });
    if (result["returnCode"] == "SUC0000") {
      const businessTripSeq = getBusinessTripSeq(result);
      businessTrip.err = "";
      if (businessTripSeq) {
        businessTrip.xftBillId = businessTripSeq;
      }
      await businessTrip.save();
      if (!options.skipMessage) {
        await sendMessages(businessTrip, fbtApply);
      }
      return true;
    } else {
      businessTrip.err = result;
      await businessTrip.save();
      if (options.allowRepair !== false) {
        const repaired = await BusinessTripServices.修正冲突时间(
          businessTrip,
          fbtApply
        );
        if (repaired) {
          return repaired;
        }
      }
      return null;
    }
  }

  static async 测试添加xft差旅记录(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply
  ) {
    return BusinessTripServices.添加xft差旅记录(businessTrip, fbtApply, {
      skipMessage: true,
    });
  }

  static async 修改xft差旅记录(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply,
    start_time: Date,
    end_time: Date
  ) {
    if (!businessTrip || !fbtApply) return null;
    if (!fbtApply.city || fbtApply.city.length == 0) return null;
    if (!businessTrip.reviseLogs) businessTrip.reviseLogs = [];
    let log = `原始时间${formatDate(businessTrip.start_time)} ${formatDate(
      businessTrip.end_time
    )} 修改为${formatDate(start_time)} ${formatDate(end_time)}`;
    const revokeResult = businessTrip.xftBillId
      ? await xftatdApiClient.revokeBusinessTrip({
          businessTripSeq: [businessTrip.xftBillId],
        })
      : null;
    const revokeSuccess =
      !businessTrip.xftBillId || revokeResult?.["returnCode"] == "SUC0000";
    if (!revokeSuccess) {
      businessTrip.reviseLogs.push(`撤回差旅记录失败 ${log}`);
      businessTrip.err = revokeResult;
      await businessTrip.save();
      return false;
    }
    businessTrip.reviseLogs.push(`撤回差旅记录成功 ${log}`);
    businessTrip.start_time = start_time;
    businessTrip.end_time = end_time;
    businessTrip.xftBillId = null;
    const createResult = await BusinessTripServices.添加xft差旅记录(
      businessTrip,
      fbtApply
    );
    if (createResult) {
      businessTrip.reviseLogs.push(`重建差旅记录成功 ${log}`);
      await businessTrip.save();
      await sendMessages(businessTrip, fbtApply);
      return true;
    }
    businessTrip.reviseLogs.push(`重建差旅记录失败 ${log}`);
    await businessTrip.save();
    return false;
  }

  static async createNonConflictingTimeSlot(fbtApply: FbtApply) {
    const start_time = new Date(fbtApply.start_time);
    const end_time = new Date(fbtApply.end_time);
    const create_time = new Date(fbtApply.create_time);
    const conflicts = (
      await BusinessTrip.getConflict(
        fbtApply.proposerUserId,
        start_time,
        end_time,
        create_time
      )
    ).filter((conflict) => conflict.fbtRootId != fbtApply.root_id);
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
            newStartTime = BusinessTripServices.getNextHalfDayStart(
              conflict.end_time
            );
          }
          if (conflict.start_time > newStartTime) {
            // 调整结束时间，避免与冲突记录重叠
            newEndTime = BusinessTripServices.getPreviousHalfDayEnd(
              conflict.start_time
            );
          }
        }
      }
      if (newStartTime > newEndTime) {
        return null;
      }
      return { start_time: newStartTime, end_time: newEndTime };
    }
    // 如果没有冲突，则直接返回原始的时间段
    return { start_time: adjustToTimeNode(start_time), end_time };
  }

  static async 修正冲突时间(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply
  ) {
    if (!BusinessTripServices.isXftTimeConflictError(businessTrip.err)) {
      return null;
    }
    const timeSlot = await BusinessTripServices.createNonConflictingTimeSlot(
      fbtApply
    );
    if (!timeSlot) return null;
    const hasChange =
      businessTrip.start_time?.getTime() !== timeSlot.start_time.getTime() ||
      businessTrip.end_time?.getTime() !== timeSlot.end_time.getTime();
    if (!hasChange) return null;
    if (!businessTrip.reviseLogs) businessTrip.reviseLogs = [];
    businessTrip.reviseLogs.push(
      `冲突修正时间为${formatDate(timeSlot.start_time)} ${formatDate(
        timeSlot.end_time
      )}`
    );
    businessTrip.start_time = timeSlot.start_time;
    businessTrip.end_time = timeSlot.end_time;
    businessTrip.xftBillId = null;
    businessTrip.err = "";
    await businessTrip.save();
    return BusinessTripServices.添加xft差旅记录(businessTrip, fbtApply, {
      allowRepair: false,
    });
  }

  static async 修正冲突时间并上传xft() {
    const businessTrips = await BusinessTrip.find({
      where: {
        err: Like("%系统存在相同时间段出差数据%"),
      },
    });
    const results: Array<{
      businessTripId: number;
      repaired: boolean;
    }> = [];
    for (const businessTrip of businessTrips) {
      if (!businessTrip.fbtRootId) {
        results.push({ businessTripId: businessTrip.id, repaired: false });
        continue;
      }
      const fbtApply = await FbtApply.findOne({
        where: { root_id: businessTrip.fbtRootId },
        relations: ["city", "user"],
        order: { update_time: "DESC", create_time: "DESC" },
      });
      if (!fbtApply) {
        results.push({ businessTripId: businessTrip.id, repaired: false });
        continue;
      }
      const repaired = await BusinessTripServices.修正冲突时间(
        businessTrip,
        fbtApply
      );
      results.push({ businessTripId: businessTrip.id, repaired: !!repaired });
    }
    return results;
  }

  static async createBusinessTrip(fbtApply: FbtApply) {
    const result = await BusinessTripServices.upsertBusinessTripFromFbt(
      fbtApply
    );
    if (!result) return null;
    if (result.action === "create") {
      await BusinessTripServices.添加xft差旅记录(
        result.businessTrip,
        fbtApply
      );
    } else if (
      result.action === "update" &&
      result.startTime &&
      result.endTime
    ) {
      await BusinessTripServices.修改xft差旅记录(
        result.businessTrip,
        fbtApply,
        result.startTime,
        result.endTime
      );
    }
    return result.businessTrip;
  }

  private static buildBusinessTripFromFbt(
    fbtApply: FbtApply,
    timeSlot: { start_time: Date; end_time: Date } | null,
    existBusinessTrip: BusinessTrip | null
  ) {
    const businessTrip = new BusinessTrip();
    businessTrip.city = fbtApply.city.map((city) => city.name);
    businessTrip.userId = fbtApply.proposerUserId;
    businessTrip.fbtRootId = fbtApply.root_id;
    businessTrip.fbtCurrentId = fbtApply.id;
    businessTrip.create_time = fbtApply.create_time;
    businessTrip.source = "分贝通";
    businessTrip.start_time = timeSlot?.start_time ?? (null as any);
    businessTrip.end_time = timeSlot?.end_time ?? (null as any);
    businessTrip.reason = fbtApply.reason;
    businessTrip.remark = fbtApply.remark;
    businessTrip.companion = fbtApply.user
      .map((user) => user.userId)
      .filter((user) => user != fbtApply.proposerUserId);

    if (
      existBusinessTrip &&
      existBusinessTrip.reviseLogs?.some((str) => str.includes("已回公司"))
    ) {
      businessTrip.end_time = existBusinessTrip.end_time;
    }
    if (!businessTrip.start_time || !businessTrip.end_time) {
      businessTrip.err = `时间段为空${formatDate(
        fbtApply.start_time
      )} ${formatDate(fbtApply.end_time)}`;
    }
    return businessTrip;
  }

  private static resolveSyncStartTime(
    existingStart: Date | null | undefined,
    nextStart: Date | null | undefined
  ) {
    if (existingStart && nextStart) {
      return new Date(
        Math.min(existingStart.getTime(), nextStart.getTime())
      );
    }
    return nextStart ?? existingStart ?? null;
  }

  private static getNextHalfDayStart(date: Date) {
    const adjustedDate = new Date(date);
    const hours = adjustedDate.getHours();
    if (hours < 12) {
      adjustedDate.setHours(12, 0, 0, 0);
    } else {
      adjustedDate.setDate(adjustedDate.getDate() + 1);
      adjustedDate.setHours(0, 0, 0, 0);
    }
    return adjustedDate;
  }

  private static getPreviousHalfDayEnd(date: Date) {
    const adjustedDate = new Date(date);
    const hours = adjustedDate.getHours();
    if (hours < 12) {
      adjustedDate.setDate(adjustedDate.getDate() - 1);
      adjustedDate.setHours(23, 59, 59, 999);
    } else {
      adjustedDate.setHours(11, 59, 59, 999);
    }
    return adjustedDate;
  }

  private static isXftTimeConflictError(err: unknown) {
    if (!err) return false;
    if (typeof err === "string") {
      if (err.includes("XFTOPN9999")) return true;
      try {
        const parsed = JSON.parse(err);
        return BusinessTripServices.isXftTimeConflictError(parsed);
      } catch {
        return false;
      }
    }
    if (typeof err === "object") {
      const errorObj = err as { returnCode?: string; errorMsg?: string };
      return (
        errorObj.returnCode === "XFTOPN9999" &&
        errorObj.errorMsg?.includes("系统存在相同时间段出差数据")
      );
    }
    return false;
  }

  private static async getFbtAppliesForSync(options?: {
    date?: Date;
    month?: Date;
    fbtRootId?: string;
  }) {
    if (!options) return [];
    if (options.fbtRootId) {
      const apply = await FbtApply.findOne({
        where: { root_id: options.fbtRootId },
        relations: ["city", "user"],
        order: { update_time: "DESC", create_time: "DESC" },
      });
      return apply ? [apply] : [];
    }
    if (options.date) {
      return FbtApply.find({
        where: {
          complete_time: Between(startOfDay(options.date), endOfDay(options.date)),
          state: 4,
        },
        relations: ["city", "user"],
        order: { complete_time: "ASC" },
      });
    }
    if (options.month) {
      return FbtApply.find({
        where: {
          complete_time: Between(
            startOfMonth(options.month),
            endOfMonth(options.month)
          ),
          state: 4,
        },
        relations: ["city", "user"],
        order: { complete_time: "ASC" },
      });
    }
    return [];
  }
}

const getBusinessTripSeq = (result: any) => {
  if (!result) return null;
  const body = result["body"];
  if (!body) return null;
  if (typeof body === "string") return body;
  return (
    body["businessTripSeq"] ??
    body["businessSeq"] ??
    body["body"]?.["businessTripSeq"] ??
    body["body"]?.["businessSeq"] ??
    null
  );
};

const sendMessages = async (businessTrip: BusinessTrip, fbtApply: FbtApply) => {
  if (process.env.NODE_ENV != "production") return;
  const startTime = businessTrip.start_time;
  const endTime1 = businessTrip.end_time;
  const beginTime = `${format(startTime, "yyyy-MM-dd")} ${getHalfDay(
    startTime
  )}`;
  const endTime = `${format(endTime1, "yyyy-MM-dd")} ${getHalfDay(endTime1)}`;
  // 发送消息
  await new MessageService([fbtApply.proposerUserId]).sendTextNotice({
    main_title: {
      title: "分贝通差旅同步考勤成功",
      desc: format(new Date(fbtApply.create_time), "yyyy-MM-dd HH:mm"),
    },
    sub_title_text: "",
    card_action: {
      type: 1,
      url: "https://xft.cmbchina.com/mobile-atd/#/trip-record",
    },
    horizontal_content_list: [
      {
        keyname: "原因",
        value: fbtApply.reason,
      },
      {
        keyname: "出差城市",
        value: fbtApply.city.map((city) => city.name).join(", "),
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
};
