import { format } from "date-fns";
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
