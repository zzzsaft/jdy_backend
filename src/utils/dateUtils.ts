import {
  format,
  parse,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  isSaturday,
  isSunday,
  startOfMonth,
  subMonths,
} from "date-fns";
export const getWeekDayName = (date: string) => {
  // 映射英文星期到中文
  const daysMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return daysMap[new Date(date).getDay()];
};

export const getHalfDay = (date: string | Date) => {
  const hour = new Date(date).getHours();
  return hour < 12 ? "AM" : "PM";
};

export const adjustToTimeNode = (
  date: Date,
  isEndTime: boolean = false
): Date => {
  const adjustedDate = new Date(date);

  const hours = adjustedDate.getHours();

  if (isEndTime) {
    // 对结束时间进行调整
    if (hours < 12) {
      // 如果结束时间小于12点，调整到12:00
      adjustedDate.setHours(11, 59, 59, 999);
    } else {
      // 如果结束时间大于12点，调整到23:59
      adjustedDate.setHours(23, 59, 59, 999);
    }
  } else {
    // 对开始时间进行调整
    if (hours < 12) {
      // 如果开始时间小于12点，调整到00:00
      adjustedDate.setHours(0, 0, 0, 0);
    } else {
      // 如果开始时间大于12点，调整到12:00
      adjustedDate.setHours(12, 0, 0, 0);
    }
  }

  return adjustedDate;
};

export const formatDate = (date: Date) => {
  return format(date, "yyyy-MM-dd HH:mm");
};

export const getDate = (date: string, time: string, begin: boolean) => {
  if (time == "AM" && begin) {
    return new Date(date + "T00:00:00");
  } else if (time == "AM" && !begin) {
    return new Date(date + "T11:59:59");
  } else if (time == "PM" && begin) {
    return new Date(date + "T12:00:00");
  } else if (time == "PM" && !begin) {
    return new Date(date + "T23:59:00");
  }
  return new Date(date + "T" + time);
};

export const getDuration = (duration: string, unit: string) => {
  if (unit == "DAY") {
    return parseFloat(duration) * 24 * 60 * 60;
  }
  return parseFloat(duration) * 60 * 60;
};

export const getDifference = (time1: string, time2: string) => {
  // 定义解析函数，支持两种时间格式
  const parseTime = (timeStr: string) => {
    return timeStr.length === 8
      ? parse(timeStr, "HH:mm:ss", new Date())
      : parse(timeStr, "HH:mm", new Date());
  };
  // 使用 parse 解析时间字符串
  const date1 = parseTime(time1);
  const date2 = parseTime(time2);

  // 计算两个时间之间的差值（分钟）
  return differenceInMinutes(date2, date1);
};

export const getLast2MouthSaturday = () => {
  const currentDate = new Date();

  // 获取上个月的所有天数
  const daysOfLastMonth = eachDayOfInterval({
    start: startOfMonth(subMonths(currentDate, 1)),
    end: endOfMonth(subMonths(currentDate, 1)),
  });

  // 获取本月的所有天数
  const daysOfThisMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  // 筛选出上个月和本月的周六
  const saturdaysOfLastMonth = daysOfLastMonth.filter((day) => isSaturday(day));
  const saturdaysOfThisMonth = daysOfThisMonth.filter((day) => isSaturday(day));

  // 返回最近两个月的周六总数量
  return saturdaysOfLastMonth.length + saturdaysOfThisMonth.length;
};

export const getMouthSaturday = (date = new Date()) => {
  const days = eachDayOfInterval({
    start: startOfMonth(date),
    end: endOfMonth(date),
  });

  const saturdays = days.filter(isSaturday).length;
  const sundays = days.filter(isSunday).length;

  if (saturdays == sundays) return saturdays;
  else return false;
};

export const splitDatesIntoContinuousIntervals = (
  startDate: Date,
  endDate: Date
): [number, number][] => {
  const intervals: [number, number][] = [];
  let currentStartDate = new Date(startDate.getTime());

  // 确保开始日期早于结束日期
  if (startDate > endDate) {
    throw new Error("Start date must be before end date.");
  }

  // 生成连续的日期区间
  while (currentStartDate < endDate) {
    let currentEndDate = new Date(currentStartDate.getTime());
    currentEndDate.setDate(currentEndDate.getDate() + 29); // 结束日期为开始日期+30天

    // 如果当前结束日期超过了最终结束日期，则将结束日期设置为endDate
    if (currentEndDate > endDate) {
      currentEndDate = new Date(endDate.getTime());
    }

    // 添加当前区间
    intervals.push([
      Math.floor(currentStartDate.getTime() / 1000),
      Math.floor(currentEndDate.getTime() / 1000),
    ]);

    // 下一个区间的开始日期为当前结束日期
    currentStartDate = new Date(currentEndDate.getTime());
  }
  return intervals;
};
