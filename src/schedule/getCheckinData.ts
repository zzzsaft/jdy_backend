import _ from "lodash";
import { IDataQueryOption } from "../type/jdy/IOptions";
import { jdyFormDataApiClient } from "../api/jdy/form_data";
import {
  checkinApiClient,
  HardwareCheckinData as HardwareCheckin,
} from "../api/wechat/chekin";
import { HardwareCheckinData } from "../entity/atd/wx_hardware_checkin_data";
import { CheckinData } from "../entity/atd/checkin_data";
import { Between, In } from "typeorm";
import { User } from "../entity/basic/employee";
import { jctimesApiClient } from "../api/jctimes/app";
import { LogCheckin } from "../entity/log/log_checkin";
import { xftatdApiClient, importAtd } from "../api/xft/xft_atd";
import { format } from "date-fns";
import { Checkin } from "../entity/atd/checkin";

class GetCheckinData {
  twoDaysInSeconds = 2 * 24 * 60 * 60;
  constructor() {}
  addWangChao = async () => {
    const raw_checkin_data = await checkinApiClient.getHardwareCheckinData(
      ["HeYanPing"],
      new Date("2024-10-02"),
      new Date("2024-10-04")
    );
    const err = await this.insertToXFT(raw_checkin_data);
  };
  getNextRawCheckinData = async () => {
    let err: any[] = [];
    const userList = (await jctimesApiClient.getUserLists()).map(
      (user) => user.userid
    );
    const startTime = await LogCheckin.getLastDate();
    const endTime = new Date();
    const raw_checkin_data = await checkinApiClient.getHardwareCheckinData(
      userList,
      startTime,
      endTime
    );
    err = await this.insertToXFT(raw_checkin_data);
    const log = LogCheckin.create({
      StartDate: startTime,
      EndDate: endTime,
      errmsg: JSON.stringify(err),
    });
    await LogCheckin.save(log);
    await this.insertHardwareCheckinData(raw_checkin_data);
  };

  getNextCheckinData = async () => {
    const lastTime = await this.getLastCheckin();
    const nowDay = new Date().getTime() / 1000;
    const timestamps = _.range(lastTime, nowDay, this.twoDaysInSeconds);
    const periods = _.zip(timestamps, _.drop(timestamps, 1).concat([nowDay]));

    const userList = await getUserList();
    for (const period of periods) {
      if (period[0] && period[1])
        await this.getCheckinData(userList, period[0], period[1]);
    }
  };

  private getLastCheckin = async () => {
    const latestRecord = await CheckinData.createQueryBuilder()
      .select("MAX(unix_checkin_time)")
      .getRawOne();
    if (latestRecord["max"]) {
      return latestRecord["max"] - 60 * 60 * 24;
    }
    return new Date("2024-01-01").getTime() / 1000;
  };

  private async getCheckinData(
    userList: string[],
    startTime: number,
    endTime: number
  ) {
    const groupedUserList = _.chunk(userList, 100);
    const dataList: CheckinData[] = [];

    for (const userListChunk of groupedUserList) {
      try {
        const checkin_data = await checkinApiClient.getCheckinData({
          useridlist: userListChunk,
          starttime: startTime,
          endtime: endTime,
        });

        for (const data of checkin_data["checkindata"]) {
          let sch_checkin_time = data.sch_checkin_time;
          const newData = CheckinData.create({
            unix_sch_checkin_time: data.sch_checkin_time,
            unix_checkin_time: data.checkin_time,
            ...data,
            sch_checkin_time: sch_checkin_time
              ? new Date(data.sch_checkin_time * 1000)
              : undefined,
            checkin_time: new Date(data.checkin_time * 1000),
            checkin_date: new Date(data.checkin_time * 1000),
          });
          dataList.push(newData);
        }
      } catch (error) {
        throw `Error fetching hardware checkin data: ${error}`;
      }
    }
    // if (dataList.length > 0) await this.insertCheckinData(dataList);
  }

  private async getCheckinDoc(dataList, relation) {
    if (dataList.length === 0) return [];
    const uniqueUserid = _.uniq(dataList.map((item) => item.userid));
    // 提取所有日期
    const dates = dataList.map((item) => item.checkin_date.getTime());
    // 找到最早的日期
    const earliestDate = new Date(Math.min(...dates) - 12 * 60 * 60 * 1000);
    // 找到最晚的日期
    const latestDate = new Date(Math.max(...dates) + 12 * 60 * 60 * 1000);
    // 查询所有匹配的记录
    const existingCheckins = await Checkin.find({
      where: {
        userid: In(uniqueUserid),
        date: Between(earliestDate, latestDate),
      },
      relations: relation,
    });
    return existingCheckins;
  }

  private async insertToXFT(dataList: HardwareCheckin) {
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
  }

  private async insertHardwareCheckinData(rawlist: HardwareCheckin) {
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
    await HardwareCheckinData.insertRawCheckinData(dataList);
  }

  // private async insertCheckinData(dataList: CheckinData[]) {
  //   const existingCheckins = await this.getCheckinDoc(dataList, [
  //     "checkin_data",
  //   ]);

  //   const groupedData = _.groupBy(
  //     dataList,
  //     (item) => `${item.userid}%${item.checkin_date.toDateString()}`
  //   );
  //   // console.log(groupedData);
  //   const checkinList: Checkin[] = [];

  //   for (const key of Object.keys(groupedData)) {
  //     const [userid, checkinDate] = key.split("%");

  //     // 检查在 Checkin 数据库中是否存在具有相同 userid 和 checkin_date 的记录
  //     const existingCheckin = existingCheckins.find(
  //       (checkins) =>
  //         checkins.userid === userid &&
  //         isDateEqual(new Date(checkins.date), new Date(checkinDate))
  //     );

  //     if (existingCheckin) {
  //       const existingUnixCheckinTimes = existingCheckin.checkin_data.map(
  //         (item) => parseInt(item.unix_checkin_time.toString())
  //       );
  //       const newDataToAdd = groupedData[key].filter(
  //         (item) => !existingUnixCheckinTimes.includes(item.unix_checkin_time)
  //       );
  //       if (newDataToAdd.length > 0) {
  //         existingCheckin.checkin_data.push(...newDataToAdd);
  //         checkinList.push(existingCheckin);
  //       }
  //     } else {
  //       // 如果不存在，则创建一个新的 Checkin 对象，并将相应的 newData 添加到其 hardware_checkin_data 属性中
  //       const newCheckin = Checkin.create({
  //         userid: userid,
  //         date: new Date(checkinDate),
  //         checkin_data: groupedData[key],
  //       });
  //       checkinList.push(newCheckin);
  //     }
  //   }
  //   const chunks = _.chunk(checkinList, 100);
  //   for (const chunk of chunks) {
  //     await Checkin.save(chunk);
  //   }
  // }
}

export const getUserList = async () => {
  return (await User.find()).map((user) => user.user_id);
  const { appid, entryid } = jdyFormDataApiClient.getFormId("员工档案");
  const option: IDataQueryOption = {
    limit: 100,
    filter: {
      rel: "and",
      cond: [
        {
          field: "_widget_1701399332764",
          method: "ne",
          value: ["离职"],
        },
        {
          field: "_widget_1705252329045",
          method: "ne",
          value: ["不参与考勤"],
        },
      ],
    },
    fields: ["_widget_1690274843463"],
  };
  return (await jdyFormDataApiClient.batchDataQuery(appid, entryid, option))
    .map((content) => content?.["_widget_1690274843463"]?.username)
    .filter((username) => !!username);
};

// export const initCheckinTable = async () => {
//   const checkinList = await Checkin.find({
//     relations: ["hardware_checkin_data"],
//   });
//   const totalCount = await HardwareCheckinData.count();
//   const pageSize = 1000;
//   // 计算总页数
//   const totalPages = Math.ceil(totalCount / pageSize);
//   for (let offset = 0; offset < totalPages; offset++) {
//     let data = await HardwareCheckinData.createQueryBuilder()
//       .offset(offset)
//       .limit(pageSize)
//       .getMany();
//     const newCheckinList = data.reduce((accumulator: Checkin[], currentA) => {
//       // 检查当前日期是否在表B中已存在
//       const existingBData = checkinList.find(
//         (b) => b.date === currentA.checkin_date && b.userid === currentA.userid
//       );
//       const existingBData1 = accumulator.find(
//         (b) => b.date === currentA.checkin_date && b.userid === currentA.userid
//       );
//       if (existingBData1) {
//         existingBData1.hardware_checkin_data.push(currentA);
//       } else if (existingBData) {
//         existingBData.hardware_checkin_data.push(currentA);
//         accumulator.push(existingBData);
//       } else {
//         // 如果不存在，则创建新的B数据，并将当前A数据添加到A列表中
//         const newBData = Checkin.create({
//           date: currentA.checkin_date,
//           userid: currentA.userid,
//           hardware_checkin_data: [currentA],
//         });
//         accumulator.push(newBData);
//       }
//       return accumulator;
//     }, []);
//     Checkin.save(newCheckinList);
//   }
// };

export const getCheckinData = new GetCheckinData();

const isDateEqual = (date1: Date, date2: Date) => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const setCheckin = async () => {
  const userList = await getUserList();
};

export const importErrorAtd = async () => {
  let err: any[] = [];
  const checkins = await LogCheckin.find();
  let result: any[] = [];
  for (const checkin of checkins) {
    const msgs = JSON.parse(checkin.errmsg);
    const a = msgs.map((msg) => {
      if ("body" in msg) {
        return msg["body"];
      }
    });
    result = result.concat(a);
  }
  result = result.filter((res) => res !== undefined);
  result.forEach((res, index) => {
    res.importNum = index + 1;
    if (res.staffNumber == "WangShunXin") res.staffName = "王顺心";
    if (res.staffNumber == "KangXiangFeng") res.staffName = "亢翔锋";
    if (res.staffNumber == "KangYingXiang") res.staffName = "亢应祥";
    if (res.staffNumber == "XuLai") res.staffName = "孔令街";
    if (res.staffNumber == "MouYongChu") res.staffName = "牟永初";
    if (res.staffNumber == "WangJian") res.staffName = "王剑";
    if (res.staffNumber == "WangJian01") res.staffName = "王剑";
    if (res.staffNumber == "HeJie2") res.staffName = "何杰";
  });
  const errs = await xftatdApiClient.importAtd(result);
  for (const temp of errs) {
    const body = result.find((da) => da.importNum == temp["importNum"]);
    err.push({
      errmsg: temp["errorMessage"],
      body: body,
    });
  }
  if (errs.length < 1) {
    for (const checkin of checkins) {
      checkin.errmsg = "[]";
    }
    await LogCheckin.save(checkins);
  }
  return err;
};
