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
