import { xftOAApiClient } from "../api/xft/xft_oa";
import { BusinessTrip } from "../entity/atd/businessTrip";
import { log } from "console";
import { LessThan, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { FbtApply } from "../entity/atd/fbt_trip_apply";
import {
  addDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  endOfDay,
  format,
} from "date-fns";
import { IFormData } from "../type/jdy/IData";
import { JdyUtil } from "../utils/jdyUtils";
import { User } from "../entity/basic/employee";
import { jdyFormDataApiClient } from "../api/jdy/form_data";
import { GetFbtApply, XftTripLog } from "./getFbtApply";
import { Department } from "../entity/basic/department";
import { XftTripCheckin } from "../entity/atd/business_trip_checkin";

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
    const logTripSync = await BusinessTrip.find({
      where: {
        start_time: LessThanOrEqual(date),
        end_time: MoreThanOrEqual(date),
      },
    });
    for (const item of logTripSync) {
      const orgid = (await User.findOne({ where: { user_id: item.userId } }))
        ?.main_department_id;
      if (!orgid) continue;
      const companyName = (
        await Department.findOne({ where: { department_id: orgid } })
      )?.company;
      if (companyName == "浙江精一新材料有限公司") continue;
      await this.createTripCheckin(item, date);
    }
  }

  static async createByRootId(fbtRootId: string, date: Date = new Date()) {
    const logTrip = await BusinessTrip.findOne({ where: { fbtRootId } });
    if (logTrip) await this.createTripCheckin(logTrip, date);
  }

  private static async createTripCheckin(
    logTripSync: BusinessTrip,
    date: Date = new Date()
  ) {
    const sendTripCheckin = new SendTripCheckin();
    if (logTripSync.start_time < date || logTripSync.end_time > date) {
      const checkin = await XftTripCheckin.addRecord({
        userId: logTripSync.userId,
        fbtRootId: logTripSync.fbtRootId,
        checkinDate: date,
      });
      if (!checkin) return;
      const data = await sendTripCheckin.generateData(checkin);
      if (!data) return;
      const result = await sendTripCheckin.startWorkFlow(data);
      if (!result?.data?._id) return;
      checkin.state = "未打卡";
      checkin.jdyId = result?.data?._id;
      await checkin.save();
    }
  }

  async generateData(checkin: XftTripCheckin) {
    const apply = await FbtApply.findOne({
      where: { root_id: checkin.fbtRootId },
      relations: ["city"],
      order: { create_time: "DESC" },
    });
    const leader = await User.getLeaderId(checkin.userId);
    const user = await User.findOne({ where: { user_id: checkin.userId } });
    if (!user) return null;
    return {
      _widget_1709084666154: JdyUtil.setText(user.name),
      _widget_1728656241816: JdyUtil.setDate(checkin.checkinDate),
      _widget_1709085088671: JdyUtil.setText(checkin.reason ?? apply?.reason),
      _widget_1709085088670: JdyUtil.setText(checkin.remark ?? apply?.remark),
      _widget_1709084666150: JdyUtil.setCombos(leader),
      _widget_1719704502367: JdyUtil.setCombos(leader),
      _widget_1709084666146: JdyUtil.setText(checkin.userId),
      _widget_1709084666149: JdyUtil.setNumber(
        parseInt(user.main_department_id)
      ),
      _widget_1728663996213: JdyUtil.setText(
        `${checkin.checkinDate.getTime()}${checkin.userId}`
      ),
      _widget_1728663996210: JdyUtil.setText("未打卡"),
      _widget_1728672400386: "需要打卡",
    };
  }

  async startWorkFlow(data) {
    return await jdyFormDataApiClient.singleDataCreate({
      app_id: "5cfef4b5de0b2278b05c8380",
      entry_id: "65dc463c9b200f9b5e3b5851",
      data,
      options: { is_start_workflow: true },
    });
  }

  static async generateDataByJdy(item) {
    let userId = JdyUtil.getUser(item["_widget_1709084666146"])?.username;
    if (!item["_widget_1709084666146"]) {
      let name = item["_widget_1709084666154"];
      userId = (await User.findOne({ where: { name } }))?.user_id ?? "";
    }
    let location = JdyUtil.getLocation(item["_widget_1708934717359"]);
    const state = item["_widget_1728663996210"];
    return {
      jdyId: item["_id"],
      userId,
      checkinTime: JdyUtil.getDate(item["_widget_1708994681757"]),
      longitude: location?.lnglatXY?.[0],
      latitude: location?.lnglatXY?.[1],
      address: `${location?.province ?? ""} ${location?.city ?? ""} ${
        location?.district ?? ""
      } ${location?.detail ?? ""}`,
      reason: item["_widget_1709085088671"],
      custom: item["_widget_1709085088670"] ?? item["_widget_1709112718167"],
      contact: item["_widget_1709085088674"],
      contactNum: item["_widget_1709085088675"],
      remark: item["_widget_1709085088673"],
      state: state,
    };
  }

  // static async addBatchTripCheckinFromJdy() {
  //   const added: XftTripCheckin[] = [];
  //   const app = jdyFormDataApiClient.getFormId("出差信息填报");
  //   const jdyData = await jdyFormDataApiClient.batchDataQuery(
  //     app.appid,
  //     app.entryid,
  //     {
  //       limit: 100,
  //     }
  //   );
  //   for (const item of jdyData) {
  //     const a = await XftTripCheckin.addExist(
  //       await this.generateDataByJdy(item)
  //     );
  //     if (a) added.push(a);
  //   }
  //   await XftTripCheckin.save(added);
  // }

  static async addTripCheckinFromJdy(item) {
    const data = await SendTripCheckin.generateDataByJdy(item);
    // const checkin = await XftTripCheckin.addExist(data);
    // if (checkin) await XftTripCheckin.save(checkin);
  }

  static async updateTripCheckinFromJdy(item) {
    const data = await XftTripCheckin.findOne({
      where: { jdyId: item["_id"] },
    });
    if (data) {
      XftTripCheckin.merge(
        data,
        (await SendTripCheckin.generateDataByJdy(item)) as any
      );
      await data.save();
    }
    if (data?.fbtRootId && data.state == "已回公司") {
      const newEndDate = endOfDay(addDays(data.checkinDate, -1));
      const tripSync = await BusinessTrip.findOne({
        where: { fbtRootId: data.fbtRootId },
      });
      if (!tripSync)
        throw new Error(
          `BusinessTrip not found ${data.fbtRootId} at updateTripCheckinFromJdy`
        );
      const fbtApply = await FbtApply.findOne({
        where: { id: tripSync.fbtCurrentId },
        relations: ["city"],
      });
      if (!fbtApply)
        throw new Error(
          `FbtApply not found ${tripSync.fbtCurrentId} at updateTripCheckinFromJdy`
        );
      tripSync.reviseLog = `${format(
        data.checkinDate,
        "MM-dd HH:mm"
      )}已回公司原时间为${format(tripSync.end_time, "MM-dd HH:mm")}`;
      if (
        Math.abs(differenceInCalendarDays(newEndDate, tripSync.end_time)) < 3 &&
        differenceInCalendarDays(data.checkinDate, data.checkinTime) == 0
      ) {
        tripSync.end_time = newEndDate;
        await XftTripLog.修改xft差旅记录(fbtApply, tripSync);
      } else {
        tripSync.reviseLog = `${tripSync.reviseLog}  未修改`;
      }
      await tripSync.save();
    }
  }
}
