import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { XftTripCheckin } from "../../entity/atd/business_trip_checkin";
import { FbtApply } from "../../entity/atd/fbt_trip_apply";
import { User } from "../../entity/basic/employee";
import { JdyUtil } from "../../utils/jdyUtils";

export class BusinessTripCheckinServices {
  static async dataCreate(data) {}
  static async dataUpdate(data) {}
  static async scheduleCreate(data) {}
}

const generateData = async (checkin: XftTripCheckin) => {
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
    _widget_1709084666149: JdyUtil.setNumber(parseInt(user.main_department_id)),
    _widget_1728663996213: JdyUtil.setText(
      `${checkin.checkinDate.getTime()}${checkin.userId}`
    ),
    _widget_1728663996210: JdyUtil.setText("未打卡"),
    _widget_1728672400386: "需要打卡",
  };
};

const generateDataByJdy = async (item) => {
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
};

const startWorkFlow = async (data) => {
  return await jdyFormDataApiClient.singleDataCreate({
    app_id: "5cfef4b5de0b2278b05c8380",
    entry_id: "65dc463c9b200f9b5e3b5851",
    data,
    options: { is_start_workflow: true },
  });
};
const startWorkFlowJ1 = async (data) => {
  return await jdyFormDataApiClient.singleDataCreate({
    app_id: "60e268ff3075400008bab4ad",
    entry_id: "670d1fce8dd96dfa02739f6a",
    data,
    options: { is_start_workflow: true },
  });
};
