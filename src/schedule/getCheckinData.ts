import _ from "lodash";
import { IDataQueryOption } from "../type/jdy/IOptions";
import { formDataApiClient } from "../utils/jdy/form_data";
import { checkinApiClient } from "../utils/wechat/chekin";
import { HardwareCheckinData } from "../entity/wechat/HardwareCheckinData";
import { CheckinData } from "../entity/wechat/CheckinData";
import { Between, In } from "typeorm";
import cron from "node-cron";
import { logger } from "../config/logger";
import { Checkin } from "../entity/wechat/Checkin";

class GetCheckinData {
  twoDaysInSeconds = 2 * 24 * 60 * 60;
  constructor() {}

  getNextRawCheckinData = async () => {
    const userList = await getUserList();
    const lastTime = await this.getLastRawCheckin();
    const nowDay = new Date().getTime() / 1000;
    const timestamps = _.range(lastTime, nowDay, this.twoDaysInSeconds);
    const periods = _.zip(timestamps, _.drop(timestamps, 1).concat([nowDay]));

    for (const period of periods) {
      if (period[0] && period[1])
        await this.getHardwareCheckinData(userList, period[0], period[1]);
    }
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

        if (checkin_data["errcode"] === 0) {
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
        } else {
          console.error(
            `Error retrieving checkin data:${checkin_data["errmsg"]}`
          );
        }
      } catch (error) {
        throw `Error fetching hardware checkin data: ${error}`;
      }
    }
    if (dataList.length > 0) await this.insertCheckinData(dataList);
  }

  private getLastRawCheckin = async () => {
    const latestRecord = await HardwareCheckinData.createQueryBuilder()
      .select("MAX(unix_checkin_time)")
      .getRawOne();
    return latestRecord["max"] || new Date("2024-01-01").getTime() / 1000;
  };

  private async getHardwareCheckinData(
    userList: string[],
    startTime: number,
    endTime: number
  ) {
    const groupedUserList = _.chunk(userList, 100);
    const dataList: HardwareCheckinData[] = [];

    for (const userListChunk of groupedUserList) {
      try {
        const checkin_data = await checkinApiClient.getHardwareCheckinData({
          useridlist: userListChunk,
          starttime: startTime,
          endtime: endTime,
        });

        if (checkin_data["errcode"] === 0) {
          for (const data of checkin_data["checkindata"]) {
            const date = new Date(data.checkin_time * 1000);

            const newData = HardwareCheckinData.create({
              userid: data.userid,
              unix_checkin_time: data.checkin_time,
              checkin_time: date,
              checkin_date: date,
              device_sn: data.device_sn,
              device_name: data.device_name,
            });
            dataList.push(newData);
          }
        } else {
          console.error(
            "Error retrieving hardware checkin data:",
            checkin_data
          );
        }
      } catch (error) {
        throw `Error fetching hardware checkin data: ${error}`;
      }
    }
    if (dataList.length > 0) await this.insertHardwareCheckinData(dataList);
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

  private async insertHardwareCheckinData(dataList: HardwareCheckinData[]) {
    const existingCheckins = await this.getCheckinDoc(dataList, [
      "hardware_checkin_data",
    ]);

    const groupedData = _.groupBy(
      dataList,
      (item) => `${item.userid}%${item.checkin_date.toDateString()}`
    );
    // console.log(groupedData);
    const checkinList: Checkin[] = [];

    for (const key of Object.keys(groupedData)) {
      const [userid, checkinDate] = key.split("%");

      // 检查在 Checkin 数据库中是否存在具有相同 userid 和 checkin_date 的记录
      const existingCheckin = existingCheckins.find(
        (checkins) =>
          checkins.userid === userid &&
          isDateEqual(new Date(checkins.date), new Date(checkinDate))
      );
      if (existingCheckin) {
        // 如果存在，将相应的 newData 添加到其 hardware_checkin_data 属性中
        existingCheckin.hardware_checkin_data.push(...groupedData[key]);
        checkinList.push(existingCheckin);
      } else {
        // 如果不存在，则创建一个新的 Checkin 对象，并将相应的 newData 添加到其 hardware_checkin_data 属性中
        const newCheckin = Checkin.create({
          userid: userid,
          date: new Date(checkinDate),
          hardware_checkin_data: groupedData[key],
        });
        checkinList.push(newCheckin);
      }
    }
    await Checkin.save(checkinList);
  }

  private async insertCheckinData(dataList: CheckinData[]) {
    const existingCheckins = await this.getCheckinDoc(dataList, [
      "checkin_data",
    ]);

    const groupedData = _.groupBy(
      dataList,
      (item) => `${item.userid}%${item.checkin_date.toDateString()}`
    );
    // console.log(groupedData);
    const checkinList: Checkin[] = [];

    for (const key of Object.keys(groupedData)) {
      const [userid, checkinDate] = key.split("%");

      // 检查在 Checkin 数据库中是否存在具有相同 userid 和 checkin_date 的记录
      const existingCheckin = existingCheckins.find(
        (checkins) =>
          checkins.userid === userid &&
          isDateEqual(new Date(checkins.date), new Date(checkinDate))
      );

      if (existingCheckin) {
        const existingUnixCheckinTimes = existingCheckin.checkin_data.map(
          (item) => parseInt(item.unix_checkin_time.toString())
        );
        const newDataToAdd = groupedData[key].filter(
          (item) => !existingUnixCheckinTimes.includes(item.unix_checkin_time)
        );
        if (newDataToAdd.length > 0) {
          existingCheckin.checkin_data.push(...newDataToAdd);
          checkinList.push(existingCheckin);
        }
      } else {
        // 如果不存在，则创建一个新的 Checkin 对象，并将相应的 newData 添加到其 hardware_checkin_data 属性中
        const newCheckin = Checkin.create({
          userid: userid,
          date: new Date(checkinDate),
          checkin_data: groupedData[key],
        });
        checkinList.push(newCheckin);
      }
    }
    const chunks = _.chunk(checkinList, 100);
    for (const chunk of chunks) {
      await Checkin.save(chunk);
    }
  }
}

export const getUserList = async () => {
  const { appid, entryid } = formDataApiClient.getFormId("员工档案");
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
  return (await formDataApiClient.batchDataQuery(appid, entryid, option))
    .map((content) => content?.["_widget_1690274843463"]?.username)
    .filter((username) => !!username);
};

export const initCheckinTable = async () => {
  const checkinList = await Checkin.find({
    relations: ["hardware_checkin_data"],
  });
  const totalCount = await HardwareCheckinData.count();
  const pageSize = 1000;
  // 计算总页数
  const totalPages = Math.ceil(totalCount / pageSize);
  for (let offset = 0; offset < totalPages; offset++) {
    let data = await HardwareCheckinData.createQueryBuilder()
      .offset(offset)
      .limit(pageSize)
      .getMany();
    const newCheckinList = data.reduce((accumulator: Checkin[], currentA) => {
      // 检查当前日期是否在表B中已存在
      const existingBData = checkinList.find(
        (b) => b.date === currentA.checkin_date && b.userid === currentA.userid
      );
      const existingBData1 = accumulator.find(
        (b) => b.date === currentA.checkin_date && b.userid === currentA.userid
      );
      if (existingBData1) {
        existingBData1.hardware_checkin_data.push(currentA);
      } else if (existingBData) {
        existingBData.hardware_checkin_data.push(currentA);
        accumulator.push(existingBData);
      } else {
        // 如果不存在，则创建新的B数据，并将当前A数据添加到A列表中
        const newBData = Checkin.create({
          date: currentA.checkin_date,
          userid: currentA.userid,
          hardware_checkin_data: [currentA],
        });
        accumulator.push(newBData);
      }
      return accumulator;
    }, []);
    Checkin.save(newCheckinList);
  }
};

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

//每天的第 1 小时触发任务
const checkinDateScheduleAt1 = cron.schedule("27 1 * * *", () => {
  logger.info("checkinDateScheduleAt1");
});

//每天的第 8 小时（即 8 点）触发任务
const checkinDateScheduleAt8 = cron.schedule("0 8 * * *", async () => {
  await getCheckinData.getNextRawCheckinData();
  await getCheckinData.getNextCheckinData();
  logger.info("checkinDateScheduleAt8");
});

//每天的第 14 小时（即 14 点）触发任务
const checkinDateScheduleAt14 = cron.schedule("0 14 * * *", async () => {
  await getCheckinData.getNextRawCheckinData();
  await getCheckinData.getNextCheckinData();
  logger.info("checkinDateScheduleAt14");
});

//每天的第 23 小时（即 23 点）触发任务
const checkinDateScheduleAt23 = cron.schedule("0 23 * * *", async () => {
  await getCheckinData.getNextRawCheckinData();
  await getCheckinData.getNextCheckinData();
  logger.info("checkinDateScheduleAt23");
});

export const checkinDateSchedule = [
  checkinDateScheduleAt1,
  checkinDateScheduleAt8,
  checkinDateScheduleAt14,
  checkinDateScheduleAt23,
];
