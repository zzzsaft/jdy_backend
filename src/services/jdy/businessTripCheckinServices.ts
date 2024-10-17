import { addDays, differenceInCalendarDays, endOfDay, format } from "date-fns";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { XftTripCheckin } from "../../entity/atd/business_trip_checkin";
import { FbtApply } from "../../entity/atd/fbt_trip_apply";
import { Department } from "../../entity/basic/department";
import { User } from "../../entity/basic/employee";
import { JdyUtil } from "../../utils/jdyUtils";
import { BusinessTrip } from "../../entity/atd/businessTrip";
import { BusinessTripServices } from "../xft/businessTripServices";
import { LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { JdyTaskEvent } from "./event";
import { formatDate } from "../../utils/dateUtils";
import { MessageHelper } from "../../api/wechat/message";

export class BusinessTripCheckinServices {
  static async dataCreate(content) {
    const data = await jdyDatetoDb(content);
    const fbtRootId = await sendNotice(data);
    if (fbtRootId) data["fbtRootId"] = fbtRootId;
    const exist = await XftTripCheckin.exists({ where: { jdyId: data.jdyId } });
    if (exist) return;
    await XftTripCheckin.create({ ...data }).save();
  }
  static async dataUpdate(content) {
    const data = await jdyDatetoDb(content);
    let existdata = await XftTripCheckin.findOne({
      where: { jdyId: content["_id"] },
    });
    if (!existdata) return;
    if (data) {
      XftTripCheckin.merge(existdata, { ...data });
      existdata = await existdata.save();
      await updateBusinessTrip(existdata);
    }
    await sendMessage(data);
  }
  static async scheduleCreate(date: Date = new Date()) {
    const logTripSync = await BusinessTrip.find({
      where: {
        start_time: LessThanOrEqual(date),
        end_time: MoreThanOrEqual(date),
      },
    });
    for (const item of logTripSync) {
      await BusinessTripCheckinServices.createTripCheckin(item, date);
    }
  }
  static async createTripCheckin(
    businessTrip: BusinessTrip,
    date: Date = new Date()
  ) {
    if (businessTrip.start_time < date || businessTrip.end_time > date) {
      const checkin = await generateCheckinbyBusinessTrip({
        userId: businessTrip.userId,
        fbtRootId: businessTrip.fbtRootId,
        checkinDate: date,
        type: "出差打卡",
      });
      if (!checkin) return;
      const data = await dbtoJdyData(checkin);
      if (!data) return;
      let result;
      if (checkin.company == "浙江精一新材料有限公司") {
        result = await startWorkFlowJ1(data);
      } else if (checkin.company == "浙江精诚模具机械有限公司") {
        result = await startWorkFlow(data);
      }
      if (!result?.data?._id) return;
      checkin.state = "未打卡";
      checkin.jdyId = result?.data?._id;
      await checkin.save();
      sendMessage(await jdyDatetoDb(result["data"]));
    }
  }
}

const generateCheckinbyBusinessTrip = async ({
  userId,
  fbtRootId,
  checkinDate,
  type,
}: {
  userId: string;
  fbtRootId: string;
  checkinDate: Date;
  type: "出差打卡" | "外出打卡";
}) => {
  checkinDate.setHours(0, 0, 0, 0);
  const exist = await XftTripCheckin.exists({
    where: {
      userId,
      checkinDate,
    },
  });
  if (exist) return null;
  const user = await User.findOne({ where: { user_id: userId } });
  if (!user)
    throw new Error(`XftTripCheckin, addRecord, User not found ${userId}`);
  const org = await Department.findOne({
    where: { department_id: user.main_department_id },
  });
  if (!org)
    throw new Error(
      `XftTripCheckin, addRecord, Department not found ${user.main_department_id}`
    );
  const checkin = new XftTripCheckin();
  checkin.company = org.company;
  checkin.fbtRootId = fbtRootId;
  checkin.userId = userId;
  checkin.departmentId = user.main_department_id;
  checkin.name = user.name;
  checkin.checkinDate = new Date(checkinDate);
  checkin.state = "未发起";
  checkin.type = type;
  if (fbtRootId) {
    const apply = await FbtApply.findOne({
      where: { root_id: checkin.fbtRootId },
      // relations: ["city"],
      order: { create_time: "DESC" },
    });
    checkin.reason = apply?.reason ?? "";
    checkin.remark = apply?.remark ?? "";
  }
  return await checkin.save();
};

const dbtoJdyData = async (checkin: XftTripCheckin) => {
  const apply = await FbtApply.findOne({
    where: { root_id: checkin.fbtRootId },
    // relations: ["city"],
    order: { create_time: "DESC" },
  });
  const leader = await User.getLeaderId(checkin.userId);
  const user = await User.findOne({ where: { user_id: checkin.userId } });
  if (!user) return null;
  return {
    _widget_1728932584746: JdyUtil.setText(checkin.type),
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

const jdyDatetoDb = async (item) => {
  // 获取userid
  let user: User | null;
  let userId = JdyUtil.getUser(item["_widget_1709084666146"])?.username;
  let name = item["_widget_1709084666154"];
  if (!userId) {
    user = await User.findOne({ where: { name } });
  } else {
    user = await User.findOne({ where: { user_id: userId } });
  }
  if (!user) throw new Error(`User not found ${userId} at jdyDatetoDb`);
  const departmentId = user.main_department_id;
  name = user.name;
  // 获取地理位置
  let location = JdyUtil.getLocation(item["_widget_1708934717359"]);
  const 是否无需打卡 = item["_widget_1728672400386"];
  const state = item?.["_widget_1728663996210"];
  let type = item?.["_widget_1728932584746"] ?? "出差打卡";
  // type = type == (!type || type == "") ? "出差打卡" : "外出打卡";
  const checkinTime = JdyUtil.getDate(item["_widget_1708994681757"]);
  const checkinDate = JdyUtil.getDate(item["_widget_1728656241816"]);
  checkinDate.setHours(0, 0, 0, 0);
  const result = {
    jdyId: item["_id"],
    userId,
    name,
    departmentId,
    checkinDate,
    checkinTime,
    longitude: location?.lnglatXY?.[0],
    latitude: location?.lnglatXY?.[1],
    address: `${location?.province ?? ""} ${location?.city ?? ""} ${
      location?.district ?? ""
    } ${location?.detail ?? ""}`,
    reason: item["_widget_1709085088671"],
    customer: item["_widget_1709085088670"] ?? item["_widget_1709112718167"],
    contact: item["_widget_1709085088674"],
    contactNum: item["_widget_1709085088675"],
    remark: item["_widget_1709085088673"],
    type,
  };
  if (state != "") result["state"] = state;
  else if (是否无需打卡 != "" && 是否无需打卡 != "需要打卡")
    result["state"] = 是否无需打卡;
  return result;
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

const updateBusinessTrip = async (tripCheckin: XftTripCheckin) => {
  if (!tripCheckin?.fbtRootId) return;
  if (tripCheckin.state != "已回公司") return;
  const newEndDate = endOfDay(addDays(tripCheckin.checkinDate, -1));
  const businessTrip = await BusinessTrip.findOne({
    where: { fbtRootId: tripCheckin.fbtRootId },
  });
  if (!businessTrip)
    throw new Error(
      `BusinessTrip not found ${tripCheckin.fbtRootId} at updateTripCheckinFromJdy`
    );
  if (!businessTrip.reviseLogs) businessTrip.reviseLogs = [];
  const fbtApply = await FbtApply.findOne({
    where: { id: businessTrip.fbtCurrentId },
    relations: ["city"],
  });
  if (!fbtApply)
    throw new Error(
      `FbtApply not found ${businessTrip.fbtCurrentId} at updateTripCheckinFromJdy`
    );
  let log = `${format(
    tripCheckin.checkinDate,
    "yyyy-MM-dd HH:mm"
  )}已回公司, 原计划出差结束时间为${format(
    businessTrip.end_time,
    "yyyy-MM-dd HH:mm"
  )}`;
  if (
    differenceInCalendarDays(
      tripCheckin.checkinDate,
      tripCheckin.checkinTime
    ) == 0 &&
    differenceInCalendarDays(newEndDate, businessTrip.end_time) != 0
  ) {
    businessTrip.end_time = newEndDate;
    businessTrip.reviseLogs.push(log);
    await BusinessTripServices.修改xft差旅记录(
      businessTrip,
      fbtApply,
      businessTrip.start_time,
      newEndDate
    );
    await updateNextBusinessTrip(tripCheckin);
  } else {
    log = `${log} 未修改`;
    businessTrip.reviseLogs.push(log);
    await businessTrip.save();
  }
};

export const updateNextBusinessTrip = async (tripCheckin: XftTripCheckin) => {
  const nextTrip = await BusinessTrip.findOne({
    where: {
      userId: tripCheckin.userId,
      start_time: MoreThanOrEqual(tripCheckin.checkinDate),
    },
    order: { start_time: "ASC" },
  });
  if (!nextTrip || !nextTrip.fbtRootId) return;
  const fbtApply = await FbtApply.findOne({
    where: { id: nextTrip.fbtCurrentId },
    relations: ["city", "user"],
  });
  if (!fbtApply) return;
  const timeSlot = await BusinessTripServices.createNonConflictingTimeSlot(
    fbtApply
  );
  if (!timeSlot)
    throw new Error(
      `Time slot conflict ${fbtApply.id} at updateNextBusinessTrip`
    );
  if (
    nextTrip.start_time.getTime() != timeSlot.start_time.getTime() ||
    nextTrip.end_time.getTime() != timeSlot.end_time.getTime()
  ) {
    nextTrip.start_time = timeSlot.start_time;
    nextTrip.end_time = timeSlot.end_time;
    await BusinessTripServices.修改xft差旅记录(
      nextTrip,
      fbtApply,
      timeSlot.start_time,
      timeSlot.end_time
    );
  }
};

export const sendMessage = async (data) => {
  // const data = await jdyDatetoDb(content["data"]);
  const horizontal_content_list = [
    {
      keyname: "应打卡时间",
      value: format(data?.checkinDate, "yyyy-MM-dd"),
    },
    {
      keyname: "出差原因",
      value: data?.reason,
    },
    {
      keyname: "客户名称",
      value: data?.customer,
    },
  ];
  if (data?.checkinTime)
    horizontal_content_list.push({
      keyname: "打卡时间",
      value: format(data?.checkinTime, "yyyy-MM-dd HH:mm"),
    });
  await JdyTaskEvent.sendMsgToWxUser(data["jdyId"], [
    {
      keyname: "应打卡时间",
      value: format(data?.checkinDate, "yyyy-MM-dd"),
    },
    {
      keyname: "出差原因",
      value: data?.reason,
    },
    {
      keyname: "客户名称",
      value: data?.customer,
    },
  ]);
};

const sendNotice = async (data) => {
  const checkinDate = data?.checkinDate;
  if (data?.type != "出差打卡" || !checkinDate) return;
  const exist = await BusinessTrip.findOne({
    where: {
      userId: data.userId,
      start_time: LessThanOrEqual(checkinDate),
      end_time: MoreThanOrEqual(checkinDate),
    },
  });
  if (exist) return exist.fbtRootId;
  await new MessageHelper([data.userId]).send_plain_text(
    `未找到${format(data.checkinDate, "yyyy-MM-dd")}拜访${
      data.customer
    }的差旅记录，请点击右下方选择分贝通或薪福通（进出口及精一）进行差旅申请，否则将影响您的考勤、报销、与差旅补贴。`
  );
  await new MessageHelper(["ZhengJie", "LiangZhi"]).send_plain_text(
    `未找到${data.name}${format(data.checkinDate, "yyyy-MM-dd")}拜访${
      data.customer
    }的差旅记录，请及时提醒进行申请办理。`
  );
};
