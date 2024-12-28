import { endOfDay, format, isBefore, startOfDay, startOfMonth } from "date-fns";
import { xftItripApiClient } from "../../api/xft/xft_itrip";
import {
  adjustToTimeNode,
  formatDate,
  getHalfDay,
} from "../../utils/dateUtils";
import { BusinessTrip } from "../../entity/atd/businessTrip";
import { XftCity } from "../../entity/util/xft_city";
import { FbtApply } from "../../entity/atd/fbt_trip_apply";
import { Between } from "typeorm";
import _ from "lodash";
import { MessageService } from "../messageServices";

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

  static async 添加xft差旅记录(businessTrip: BusinessTrip, fbtApply: FbtApply) {
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
    let applier = businessTrip.userId.slice(0, 20);

    const departCityCode = await getCityCode(fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (fbtApply.city.length > 1) {
      destinationCityCode = await getCityCode(fbtApply.city[1].name);
    }

    const cities = fbtApply.city.map((city) => {
      return city.name;
    });
    const result = await xftItripApiClient.createApplyTravel({
      outRelId: fbtApply.root_id,
      empNumber: applier,
      reason: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(",")}`,
      departCityCode,
      destinationCityCode,
      start_time: adjustToTimeNode(businessTrip.start_time, true),
      end_time: adjustToTimeNode(businessTrip.end_time, true),
      peerEmpNumbers: fbtApply.user
        .map((user) => user.userId.slice(0, 20))
        .filter((user) => user != applier),
    });
    if (result["returnCode"] == "SUC0000") {
      businessTrip.err = "";
      businessTrip.xftBillId = result["body"];
      await businessTrip.save();
      await sendMessages(businessTrip, fbtApply);
      return true;
    } else {
      businessTrip.err = result;
      await businessTrip.save();
      return null;
    }
  }

  static async 修改xft差旅记录(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply,
    start_time: Date,
    end_time: Date,
    companion: string[] = []
  ) {
    if (!businessTrip || !fbtApply) return null;
    if (!businessTrip.xftBillId) return null;
    if (!fbtApply.city || fbtApply.city.length == 0) return null;
    let applier = businessTrip.userId.slice(0, 20);
    const departCityCode = await getCityCode(fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (fbtApply.city.length > 1) {
      destinationCityCode = await getCityCode(fbtApply.city[1].name);
    }
    const result = await _修改xft差旅记录({
      billId: businessTrip.xftBillId,
      changerNumber: applier,
      departCityCode,
      destinationCityCode,
      start_time: adjustToTimeNode(start_time, true),
      end_time: adjustToTimeNode(end_time, true),
      peerEmpNumbers: companion.map((user) => user.slice(0, 20)),
    });
    if (!businessTrip.reviseLogs) businessTrip.reviseLogs = [];
    let log = `原始时间${formatDate(businessTrip.start_time)} ${formatDate(
      businessTrip.end_time
    )} 修改为${formatDate(start_time)} ${formatDate(end_time)}`;
    if (result) {
      businessTrip.reviseLogs.push(`修改差旅记录成功 ${log}`);
      businessTrip.start_time = start_time;
      businessTrip.end_time = end_time;
      await businessTrip.save();
      await sendMessages(businessTrip, fbtApply);
      return true;
    } else {
      businessTrip.reviseLogs.push(`修改差旅记录失败 ${log}`);
      await businessTrip.save();
      return false;
    }
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
            newStartTime = adjustToTimeNode(
              new Date(conflict.end_time.getTime() + 1 * 1000)
            ); // 冲突的结束时间 + 1秒
          }
          if (conflict.start_time > newStartTime) {
            // 调整结束时间，避免与冲突记录重叠
            newEndTime = adjustToTimeNode(
              new Date(conflict.start_time.getTime() - 1 * 1000),
              true
            ); // 冲突的开始时间 - 1秒
          }
        }
      }
      return { start_time: newStartTime, end_time: newEndTime };
    }
    // 如果没有冲突，则直接返回原始的时间段
    return { start_time: adjustToTimeNode(start_time), end_time };
  }

  static async createBusinessTrip(fbtApply: FbtApply) {
    const existBusinessTrip = await BusinessTrip.findOne({
      where: { fbtRootId: fbtApply.root_id },
    });
    if (
      existBusinessTrip &&
      existBusinessTrip.fbtCurrentId == fbtApply.id
      // ||
      // existBusinessTrip.create_time.getTime() <=
      //   fbtApply.create_time.getTime()
    ) {
      return null;
    }
    const timeSlot = await BusinessTripServices.createNonConflictingTimeSlot(
      fbtApply
    );
    let businessTrip = new BusinessTrip();
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
    )
      businessTrip.end_time = existBusinessTrip.end_time;
    if (!businessTrip.start_time || !businessTrip.end_time) {
      businessTrip.err = `时间段为空${formatDate(
        fbtApply.start_time
      )} ${formatDate(fbtApply.end_time)}`;
    }
    // await BusinessTrip.upsert(businessTrip, {
    //   conflictPaths: ["fbtRootId"],
    //   skipUpdateIfNoValuesChanged: true,
    // });
    if (!existBusinessTrip) {
      await BusinessTripServices.添加xft差旅记录(businessTrip, fbtApply);
    } else if (
      businessTrip.start_time?.getTime() <
        existBusinessTrip.start_time?.getTime() ||
      businessTrip.end_time?.getTime() !=
        existBusinessTrip.end_time?.getTime() ||
      !_.isEqual(businessTrip.companion, existBusinessTrip.companion)
    ) {
      const startTime = Math.min(
        existBusinessTrip.start_time?.getTime(),
        businessTrip.start_time?.getTime()
      );
      BusinessTrip.merge(existBusinessTrip, businessTrip);
      await BusinessTripServices.修改xft差旅记录(
        existBusinessTrip,
        fbtApply,
        new Date(startTime),
        businessTrip.end_time
      );
    } else {
      BusinessTrip.merge(existBusinessTrip, businessTrip);
      await existBusinessTrip.save();
    }
  }
}

const _修改xft差旅记录 = async ({
  billId,
  changerNumber,
  departCityCode,
  destinationCityCode,
  start_time,
  end_time,
  changeReason = "1",
  peerEmpNumbers = [],
}: {
  billId: string;
  changerNumber: string;
  departCityCode: any;
  destinationCityCode: any;
  start_time: Date;
  end_time: Date;
  changeReason?: string;
  peerEmpNumbers?: string[]; // 参数的类型标注为 string[]
}) => {
  const result = await xftItripApiClient.updateApplyTravel({
    billId,
    changerNumber,
    peerEmpNumbers,
    changeReason,
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
    return true;
  }
  return false;
};

const getCityCode = async (cityName: string) => {
  return (
    await XftCity.findOne({
      where: { cityName: cityName.split("/")[0].split(",")[0] },
    })
  )?.cityCode;
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
