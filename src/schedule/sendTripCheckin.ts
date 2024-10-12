import { xftOAApiClient } from "../utils/xft/xft_oa";
import { LogTripSync } from "../entity/atd/trip";
import { log } from "console";
import { LessThan, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { XftTripCheckin } from "../entity/atd/trip_checkin";
import { FbtApply } from "../entity/atd/fbt_trip_apply";
import { format } from "date-fns";
import { IFormData } from "../type/jdy/IData";
import { JdyUtil } from "../utils/jdy/jdy_util";
import { User } from "../entity/basic/employee";
import { jdyFormDataApiClient } from "../utils/jdy/form_data";

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
        start_time: LessThanOrEqual(date),
        end_time: MoreThanOrEqual(date),
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
    if (logTripSync.start_time < date || logTripSync.end_time > date) {
      const checkin = await XftTripCheckin.addRecord({
        userId: logTripSync.userId,
        fbtRootId: logTripSync.fbtRootId,
        checkinDate: date,
      });
      if (!checkin) return;
      const data = await sendTripCheckin.generateData(checkin);
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
    if (!apply) return null;
    const leader = await User.getLeaderId(apply.proposerUserId);
    return {
      _widget_1709084666154: JdyUtil.setText(apply.proposer_name),
      _widget_1728656241816: JdyUtil.setDate(checkin.checkinDate),
      _widget_1728656241817: JdyUtil.setText(apply.reason),
      _widget_1709085088670: JdyUtil.setText(apply.remark),
      _widget_1709112718167: JdyUtil.setText(apply.remark),
      _widget_1719704502367: JdyUtil.setCombos(leader),
      _widget_1709084666146: JdyUtil.setText(checkin.userId),
      _widget_1709084666149: JdyUtil.setNumber(parseInt(apply.departmentId)),
      _widget_1728663996213: JdyUtil.setText(
        `${checkin.checkinDate.getTime()}${checkin.userId}`
      ),
      _widget_1728663996210: JdyUtil.setText("未打卡"),
      _widget_1728672318803: JdyUtil.setText(
        apply.city.map((ci) => ci.name)?.join(",")
      ),
      _widget_1709085088671: JdyUtil.setText(apply.reason),
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
    return {
      jdyId: item["_id"],
      userId,
      checkinTime: JdyUtil.getDate(item["_widget_1708994681757"]),
      location: {
        longitude: location.lnglatXY[0],
        latitude: location.lnglatXY[1],
      },
      address: `${location.province} ${location.city} ${location.district} ${location.detail}`,
      reason: item["_widget_1709085088671"],
      custom: item["_widget_1709085088670"] ?? item["_widget_1709112718167"],
      contact: item["_widget_1709085088674"],
      contactNum: item["_widget_1709085088675"],
      remark: item["_widget_1709085088673"],
    };
  }

  static async addBatchTripCheckinFromJdy() {
    const added: XftTripCheckin[] = [];
    const app = jdyFormDataApiClient.getFormId("出差信息填报");
    const jdyData = await jdyFormDataApiClient.batchDataQuery(
      app.appid,
      app.entryid,
      {
        limit: 100,
      }
    );
    for (const item of jdyData) {
      const a = await XftTripCheckin.addExist(
        await this.generateDataByJdy(item)
      );
      if (a) added.push(a);
    }
    await XftTripCheckin.save(added);
  }

  static async addTripCheckinFromJdy(item) {
    const checkin = await XftTripCheckin.addExist(
      await this.generateDataByJdy(item)
    );
    if (checkin) await XftTripCheckin.save(checkin);
  }

  static async updateTripCheckinFromJdy(item) {
    const data = await XftTripCheckin.findOne({
      where: { jdyId: item["_id"] },
    });
    if (data) {
      XftTripCheckin.merge(data, await this.generateDataByJdy(item));
      await data.save();
    }
    if (data?.fbtRootId && data.state == "已回公司") {
      await LogTripSync.update(
        { fbtRootId: data.fbtRootId },
        { end_time: new Date() }
      );
    }
  }
}
