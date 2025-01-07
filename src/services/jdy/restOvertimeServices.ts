import { Between, In, Not } from "typeorm";
import ExcelJS from "exceljs";
import { JdyRestOvertime } from "../../entity/atd/jdy_rest_overtime";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isEqual,
  parse,
  startOfMonth,
} from "date-fns";
import stream from "stream";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { logger } from "../../config/logger";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import {
  getWeekDayName,
  isAfterTime,
  isBeforeTime,
} from "../../utils/dateUtils";
import { AtdDayResult } from "../../entity/atd/day_result";
import _ from "lodash";
import { dayResultServices } from "../xft/dayResultServices";
import { XftAtdOvertime } from "../../entity/atd/xft_overtime";

class RestOvertimeServices {
  add = async (data) => {
    const record = await JdyRestOvertime.createRecord(data);
    if (!record) {
      logger.error(
        `User not found at JdyRestOvertime: ${JSON.stringify(data)}`
      );
      return;
    }
    await JdyRestOvertime.upsert(record, ["id"]);
    await this.addToXft(record);
  };
  async count(date: Date, userid) {
    let count = 0;
    count +=
      (await JdyRestOvertime.sum("durationDay", {
        userid,
        result: Not("拒绝"),
        type: "轮休假加班",
        startTime: Between(startOfMonth(date), endOfMonth(date)),
      })) ?? 0;
    count += _.sum(
      (
        await XftAtdOvertime.find({
          where: {
            userId: userid,
            approveStatus: "passed",
            overtimeType: "休息日",
            begDate: Between(startOfMonth(date), endOfMonth(date)),
          },
        })
      ).map((item) => {
        if (isBeforeTime(item.begDate, "12:00")) return 0.5;
        if (isAfterTime(item.begDate, "12:00")) return 0.5;
        if (isBeforeTime(item.endDate, "12:00")) return 0.5;
        return 1;
      })
    );
    return count;
  }
  addToXft = async (data: JdyRestOvertime) => {
    if (data.result != "通过" && data.type != "轮休假加班") return;
    const diffDay = differenceInCalendarDays(data.endTime, data.startTime);
    const result = await xftatdApiClient.addOvertime({
      staffName: data.name,
      staffNumber: data.userid,
      overtimeDate: format(data.startTime, "yyyy-MM-dd"),
      beginTime: format(data.startTime, "HH:mm"),
      beginTimeType: "当日",
      endTime: format(data.endTime, "HH:mm"),
      endTimeType: diffDay == 0 ? "当日" : "次日",
      overtimeReason: data.remark,
    });
    if (result["body"]?.["body"] == null) {
      await this.addToDb(data);
    }
  };
  addToDb = async (data: JdyRestOvertime) => {
    const records = await xftatdApiClient.getOvertimeRecord(
      format(data.startTime, "yyyy-MM-dd"),
      format(data.endTime, "yyyy-MM-dd"),
      data.userid
    );
    if (!records["body"]["records"]) return;
    for (const record of records["body"]["records"]) {
      await XftAtdOvertime.addRecord1(record);
      if (isEqual(record["beginTime"], data.startTime)) {
        data.serialNumber = record["busNumber"];
        data.result = "已导入";
        await data.save();
      }
    }
  };
  async getShiftExceltoLocal(
    dateString: string = format(new Date(), "yyyyMM")
  ) {
    const workbook = await createShiftExcel(dateString);
    const filePath = `./${dateString}排班表.xlsx`;
    await workbook.xlsx.writeFile(filePath);
  }
  async getShiftExcel(dateString: string = format(new Date(), "yyyyMM")) {
    const workbook = await createShiftExcel(dateString);
    const passthrough = new stream.PassThrough();
    await workbook.xlsx.write(passthrough);
    return { file: passthrough, name: `${dateString}排班表.xlsx` };
  }
}

export const restOvertimeServices = new RestOvertimeServices();

export const addExistRecord = async () => {
  let app = jdyFormDataApiClient.getFormId("加班申请表");
  const data = await jdyFormDataApiClient.batchDataQuery(
    app.appid,
    app.entryid,
    {
      limit: 100,
      filter: {
        rel: "and",
        cond: [
          {
            field: "_widget_1691481359331",
            method: "eq",
            value: ["通过"],
          },
          {
            field: "_widget_1691147512529",
            method: "range",
            value: ["2024-12-01", "2024-12-31"],
          },
        ],
      },
    }
  );
  const result: JdyRestOvertime[] = [];
  for (const record of data) {
    let re = await JdyRestOvertime.createRecord(record);
    if (!re) continue;
    result.push(re);
    // await restOvertimeServices.add(record);
  }
  const existingIds = await JdyRestOvertime.find({
    select: ["id"],
    where: { id: In(result.map((d) => d.id)) },
  });
  const existingIdSet = new Set(existingIds.map((e) => e.id));
  const newData = result.filter((item) => !existingIdSet.has(item.id));
  if (newData.length > 0) {
    await JdyRestOvertime.insert(newData);
  }
  // await JdyRestOvertime.upsert(result, ["id"]);
};

export const addExistToXft = async () => {
  const data = await JdyRestOvertime.find({
    where: {
      result: "通过",
      type: "轮休假加班",
      startTime: Between(new Date("2024-12-1"), new Date("2025-01-01")),
    },
  });
  for (const item of data) {
    await restOvertimeServices.addToXft(item);
  }
};

export const createShiftExcel = async (
  dateString: string = format(new Date(), "yyyyMM")
) => {
  const date = parse(dateString, "yyyyMM", new Date());
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${format(date, "yyyy-MM")}排班表`);

  // 添加列标题
  const column: any[] = [
    { header: "*姓名", key: "name", width: 10 },
    { header: "*工号", key: "userId", width: 10 },
  ];
  for (
    let currentDate = startOfMonth(date);
    currentDate <= endOfMonth(date);
    currentDate = addDays(currentDate, 1)
  ) {
    // 格式化输出日期和星期几
    column.push({
      header: `${format(currentDate, "yyyy-MM-dd")}(${getWeekDayName(
        currentDate
      )})`,
      key: format(currentDate, "dd"),
      width: 20,
    });
  }
  worksheet.columns = [...column];

  let data = await JdyRestOvertime.find({
    where: {
      startTime: Between(startOfMonth(date), endOfMonth(date)),
      result: Not("不通过"),
      type: "轮休假加班",
    },
    select: ["userid", "name", "startTime"],
  });
  const data1 = (
    await XftAtdOvertime.find({
      where: {
        approveStatus: "passed",
        overtimeType: "休息日",
        begDate: Between(startOfMonth(date), endOfMonth(date)),
      },
      select: ["userId", "stfName", "begDate"],
    })
  ).map(({ stfName, begDate, userId }) => ({
    userid: userId,
    name: stfName,
    startTime: begDate,
  })) as any;
  data = [...data, ...data1];
  const groupedData = _.groupBy(data, "userid");
  // 使用 for...in 循环遍历分组后的结果
  for (const userid in groupedData) {
    let row = { userId: userid };
    if (groupedData.hasOwnProperty(userid)) {
      row["name"] = groupedData[userid][0].name;
      for (const item of groupedData[userid]) {
        const shift = await dayResultServices.getShift(item.startTime, userid);
        if (shift) {
          row[format(item.startTime, "dd")] = shift + "(加班)";
        } else {
          row[format(item.startTime, "dd")] = "休息";
        }
      }
    }
    worksheet.addRow(row);
  }

  worksheet.insertRow(1, [`${format(date, "yyyyMM")}排班表`]); // 插入第一行空行
  worksheet.insertRow(2, ""); // 插入第二行空行
  worksheet.insertRow(3, ""); // 插入第二行空行
  return workbook;
};
