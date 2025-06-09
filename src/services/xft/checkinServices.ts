import { xftatdApiClient } from "../../api/xft/xft_atd";
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { User } from "../../entity/basic/employee";
import {
  checkinApiClient,
  HardwareCheckinData as HardwareCheckin,
} from "../../api/wechat/chekin";
import { HardwareCheckinData } from "../../entity/atd/wx_hardware_checkin_data";
import { LogCheckin } from "../../entity/log/log_checkin";
import { jctimesApiClient } from "../../api/jctimes/app";
import { Between } from "typeorm";
import _ from "lodash";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import {
  compressImage,
  downloadFileStream,
  streamToBase64,
} from "../../utils/fileUtils";
import { PassThrough } from "stream";
import { XftTripCheckin } from "../../entity/atd/business_trip_checkin";
import { businessTripService } from "../businessTripService";
class CheckinServices {
  async scheduleCheckinMonthly() {
    const startTime = startOfMonth(new Date());
    const endTime = endOfMonth(new Date());
    // const raw_checkin_data = await getCheckin(startTime, endTime);
    // await insertHardwareCheckinData(raw_checkin_data);
    const dates = eachDayOfInterval({ start: startTime, end: endTime });

    for (let i = 0; i < dates.length - 1; i++) {
      await insertToXFTfromDb(dates[i], dates[i + 1]);
    }
  }
  async scheduleCheckinDaily(datenumber = -1) {
    const startTime = startOfDay(addDays(new Date(), datenumber));
    const endTime = endOfDay(addDays(new Date(), datenumber));
    await updateCheckin(startTime, endTime);
    return true;
  }
  async scheduleCheckin() {
    const startTime = await LogCheckin.getLastDate();
    const endTime = new Date();
    await updateCheckin(startTime, endTime);
  }

  async getRealTimeAtd() {
    // return await xftatdApiClient.getRealTimeAtd();
  }

  addCheckinRecord = async (checkins: XftTripCheckin[]) => {
    let records: any[] = [];
    for (const checkin of checkins) {
      const record = await this.generateXftCheckinRecord(checkin);
      if (record) records.push(record);
    }
    await xftatdApiClient.addOutData(records);
  };
  private generateXftCheckinRecord = async (checkin: XftTripCheckin) => {
    const add = (value) => {
      return {
        staffName: checkin.name,
        staffNumber: checkin.userId.slice(0, 20),
        appModule: "D" as "D",
        atdDate: checkin.checkinTime,
        item: [
          {
            itemName: "出差打卡统计",
            itemValue: value,
          },
        ],
      };
    };
    if (!checkin.checkinTime || ["已回公司", "已请假"].includes(checkin.state))
      return;
    if (!checkin.fbtRootId && !checkin.xftFormId) {
      const tripId = await businessTripService.findBusinessTrip(
        checkin.userId,
        checkin.checkinDate
      );
      if (tripId) {
        if (tripId.startsWith("FORM")) {
          checkin.xftFormId = tripId;
        } else {
          checkin.fbtRootId = tripId;
        }
        await checkin.save();
      }
    }
    if (checkin.state == "次日补卡") {
      return add("有效补卡");
    }
    if (checkin.area == "境外出差" || checkin.reason == "展会/会议") {
      return add("展会打卡");
    } else if (checkin.userId == "XuLai") {
      return add("无补贴打卡");
    }
    checkin.isChecked = true;
    return add("有效打卡");
  };
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
  const uniqueDataMap = new Map<string, any>();
  let index = 1;
  let data1: any[] = [];
  for (const data of dataList) {
    const userName = userMap.get(data.userid) || "";
    const key = `${data.userid}-${data.unix_checkin_time}`;
    if (uniqueDataMap.has(key)) continue;
    const result = {
      staffName: userName,
      staffNumber: data.userid.slice(0, 15),
      clickDate: format(data.checkin_time, "yyyy-MM-dd"),
      clickTime: format(data.checkin_time, "HH:mm:ss"),
      remark: "企业微信打卡",
      workPlace: data.device_name,
      importNum: index,
    };
    if (result["staffName"] == "") {
      err.push(result);
    }
    uniqueDataMap.set(key, result);
    index++;
    data1.push(result);
  }
  const errs = await xftatdApiClient.importAtd(data1);
  for (const temp of errs) {
    const body = data1.find((da) => da.importNum == temp["importNum"]);
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
  const uniqueDataMap = new Map<string, HardwareCheckinData>();
  for (const data of rawlist) {
    const key = `${data.userid}-${data.unix_checkin_time}`;
    if (uniqueDataMap.has(key)) continue;
    const newData = HardwareCheckinData.create({
      userid: data.userid,
      unix_checkin_time: data.unix_checkin_time,
      checkin_time: data.checkin_time,
      checkin_date: data.checkin_time,
      device_sn: data.device_sn,
      device_name: data.device_name,
    });
    uniqueDataMap.set(key, newData);
    dataList.push(newData);
  }
  const chunkedList = _.chunk(dataList, 2000);
  for (const chunk of chunkedList) {
    await HardwareCheckinData.upsert(chunk, {
      conflictPaths: ["userid", "unix_checkin_time"],
      skipUpdateIfNoValuesChanged: true,
    });
  }
};

const insertToXFTfromDb = async (startTime, endTime) => {
  let err: any[] = [];
  const dataDb = await HardwareCheckinData.createQueryBuilder("checkin")
    .leftJoinAndSelect(
      "md_employee",
      "employee",
      "checkin.userid = employee.user_id"
    )
    .where("checkin.checkin_time BETWEEN :startTime AND :endTime", {
      startTime,
      endTime,
    })
    .select([
      "checkin", // 获取 checkin 表的所有字段
      "employee.name", // 获取 md_employee 表中的 name 字段
    ])
    .orderBy("checkin.userid")
    .getRawMany();
  const data = dataDb.map((data, index) => {
    const result = {
      staffName: data.employee_name,
      staffNumber: data.checkin_userid.slice(0, 15),
      clickDate: format(data.checkin_checkin_time, "yyyy-MM-dd"),
      clickTime: format(data.checkin_checkin_time, "HH:mm:ss"),
      remark: "企业微信打卡",
      workPlace: data.checkin_device_name,
      importNum: index,
    };
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

const getCheckin = async (startTime, endTime) => {
  const userList = (await jctimesApiClient.getUserLists()).map(
    (user) => user.userid
  );
  return await checkinApiClient.getHardwareCheckinData(
    userList,
    startTime,
    endTime
  );
};

const updateCheckin = async (startTime, endTime) => {
  let err: any[] = [];
  const raw_checkin_data = await getCheckin(startTime, endTime);
  await insertHardwareCheckinData(raw_checkin_data);
  err = await insertToXFT(raw_checkin_data);
  const log = LogCheckin.create({
    StartDate: startTime,
    EndDate: endTime,
    errmsg: JSON.stringify(err),
  });
  await LogCheckin.save(log);
};

export const addUserfaceToWechat = async () => {
  const data = await 获取员工档案();
  for (const jdyInfo of data) {
    await updateExistInfo(jdyInfo);
  }
};
const updateExistInfo = async (data) => {
  const userId = data["_widget_1691239227137"];
  if (userId == "") return;
  const user = await User.findOne({ where: { user_id: userId } });
  if (!user || user.wxFace || !user.is_employed) return;
  const photo: any[] = data["_widget_1704997861762"];
  if (photo.length == 0) return;
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  let fileStream = await downloadFileStream(url);
  fileStream = await compressImage(fileStream);
  let face = await streamToBase64(fileStream);
  const result = await checkinApiClient.addCheckinUserface({
    userid: userId,
    userface: face,
  });
  if (result["errcode"] == 0) {
    user.wxFace = true;
    await user.save();
  } else {
    console.log(result);
  }
};
const 获取员工档案 = async () => {
  const app = jdyFormDataApiClient.getFormId("员工档案");
  return await jdyFormDataApiClient.batchDataQuery(app.appid, app.entryid, {
    filter: {
      rel: "and",
      cond: [
        { field: "_widget_1701399332764", method: "ne", value: ["离职"] },
        { field: "_widget_1704997861762", method: "not_empty" },
      ],
    },
    limit: 100,
  });
};

export const addCheckinToXFT = async (date = new Date("2024-10-1")) => {
  const data = await XftTripCheckin.find({
    where: {
      checkinDate: Between(
        startOfMonth(new Date("2024-12-01")),
        new Date("2025-01-01")
      ),
    },
  });
  await checkinServices.addCheckinRecord(data);
};
