import { get } from "lodash";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import { addDays, endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import { User } from "../../entity/basic/employee";
import {
  checkinApiClient,
  HardwareCheckinData as HardwareCheckin,
} from "../../api/wechat/chekin";
import { HardwareCheckinData } from "../../entity/atd/wx_hardware_checkin_data";
import { LogCheckin } from "../../entity/log/log_checkin";
import { jctimesApiClient } from "../../api/jctimes/app";
class CheckinServices {
  async scheduleCheckinMonthly() {
    const startTime = startOfMonth(new Date());
    const endTime = new Date();
    await updateCheckin(startTime, endTime);
  }
  async scheduleCheckinDaily() {
    const startTime = startOfDay(addDays(new Date(), -1));
    const endTime = endOfDay(addDays(new Date(), -1));
    await updateCheckin(startTime, endTime);
  }
  async scheduleCheckin() {
    const startTime = await LogCheckin.getLastDate();
    const endTime = new Date();
    await updateCheckin(startTime, endTime);
  }

  async getRealTimeAtd() {
    // return await xftatdApiClient.getRealTimeAtd();
  }
}

export const checkinServices = new CheckinServices();
const getRealTimeAtd = async (data: {
  atdGroupSeq?;
  noScheduleClass?;
  atdAbnormal?;
}) => {
  const payload = {
    // attendanceDate: format(new Date(), "yyyy-MM-dd"),
    attendanceDate: "2024-10-22",
    attendanceItemSetType: "K",
    ...(data.atdGroupSeq && { atdGroupSeq: data.atdGroupSeq }),
    realTimeAttendanceStaQuery: {
      ...(data.noScheduleClass && { noScheduleClass: data.noScheduleClass }),
      scheduleClass: "2",
    },
    realTimeAttendanceBizQuery: {
      ...(data.atdAbnormal && { atdAbnormal: data.atdAbnormal }),
    },
    pageQueryDto: {
      pageNbr: 1,
      pageNum: 1000,
    },
  };
  const result = await xftatdApiClient.getRealTimeAtd(payload);
  if (result["returnCode"] != "SUC0000") return;
  return result["body"];
};

export const 获取未排班人员 = async () => {
  let getShiftWork = await xftatdApiClient.getAttendanceGroup({
    groupType: "2",
  });
  if (getShiftWork["returnCode"] != "SUC0000") return;
  getShiftWork = getShiftWork["body"]["attendanceGroupBaseInfoDtoList"]
    .filter((group) => !group.groupName.includes("精一"))
    .map((group) => group.groupSeq);
  const empList: any[] = [];
  for (const group of getShiftWork) {
    const data = await getRealTimeAtd({
      atdGroupSeq: group,
      noScheduleClass: "0",
      atdAbnormal: "3",
    });
    empList.push(...data["realTimeAttendanceDetailDtoList"]);
  }
};

const insertToXFT = async (dataList: HardwareCheckin) => {
  let err: any[] = [];
  const users = await User.find({
    select: ["user_id", "name"], // 只选择 user_id 和 name 字段
  });
  const userMap = new Map(users.map((user) => [user.user_id, user.name]));
  const data = dataList.map((data, index) => {
    const userName = userMap.get(data.userid) || ""; // 从 Map 中获取用户姓名
    const result = {
      staffName: userName,
      staffNumber: data.userid,
      clickDate: format(data.checkin_time, "yyyy-MM-dd"),
      clickTime: format(data.checkin_time, "HH:mm:ss"),
      remark: "企业微信打卡",
      workPlace: data.device_name,
      importNum: index,
    };
    if (result["staffName"] == "") {
      err.push(result);
    }
    return result;
  });
  const errs = await xftatdApiClient.importAtd(data);
  for (const temp of errs) {
    const body = data.find((da) => da.importNum == temp["importNum"]);
    err.push({
      errmsg: temp["errorMessage"],
      body: body,
    });
  }
  err = err.concat(errs);
  return err;
};

const insertHardwareCheckinData = async (rawlist: HardwareCheckin) => {
  const dataList: HardwareCheckinData[] = [];
  for (const data of rawlist) {
    const newData = HardwareCheckinData.create({
      userid: data.userid,
      unix_checkin_time: data.unix_checkin_time,
      checkin_time: data.checkin_time,
      checkin_date: data.checkin_time,
      device_sn: data.device_sn,
      device_name: data.device_name,
    });
    dataList.push(newData);
  }
  await HardwareCheckinData.upsert(dataList, {
    conflictPaths: ["userid", "unix_checkin_time"],
    skipUpdateIfNoValuesChanged: true,
  });
};

const updateCheckin = async (startTime, endTime) => {
  let err: any[] = [];
  const userList = (await jctimesApiClient.getUserLists()).map(
    (user) => user.userid
  );
  const raw_checkin_data = await checkinApiClient.getHardwareCheckinData(
    userList,
    startTime,
    endTime
  );
  err = await insertToXFT(raw_checkin_data);
  const log = LogCheckin.create({
    StartDate: startTime,
    EndDate: endTime,
    errmsg: JSON.stringify(err),
  });
  await LogCheckin.save(log);
  await insertHardwareCheckinData(raw_checkin_data);
};
