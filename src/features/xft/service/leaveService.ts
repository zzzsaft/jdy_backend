import {
  compareAsc,
  differenceInDays,
  endOfDay,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { Department } from "../../../entity/basic/department";
import { User } from "../../../entity/basic/employee";

export interface DateRange {
  begDate: string;
  begTime: string;
  endDate: string;
  endTime: string;
}

export const getWeekendDates = () => {
  const today = new Date();

  // 获取周六的日期（将周日作为一周的起始，因此周六是默认的一周的最后一天）
  const saturday = startOfDay(endOfWeek(today, { weekStartsOn: 0 })); // weekStartsOn: 1 表示周一为一周的开始
  const sunday = endOfDay(new Date(saturday));
  sunday.setDate(saturday.getDate() + 1); // 周日是周六的第二天

  return { saturday, sunday };
};

export const generateCheckBox = () => {
  const { saturday, sunday } = getWeekendDates();
  return [
    {
      id: `${format(saturday, "yyyy-MM-dd")}/AM`,
      text: `${format(saturday, "MM/dd")} 周六上午`,
      is_checked: false,
    },
    {
      id: `${format(saturday, "yyyy-MM-dd")}/PM`,
      text: `${format(saturday, "MM/dd")} 周六下午`,
      is_checked: false,
    },
    {
      id: `${format(sunday, "yyyy-MM-dd")}/AM`,
      text: `${format(sunday, "MM/dd")} 周日上午`,
      is_checked: false,
    },
    {
      id: `${format(sunday, "yyyy-MM-dd")}/PM`,
      text: `${format(sunday, "MM/dd")} 周日下午`,
      is_checked: false,
    },
  ];
};

export const generateLeaveConfig = (
  user: {
    userid: string;
    stfSeq: string;
    stfName: string;
    orgSeq: string;
  },
  quota
) => {
  const { userid, stfName, stfSeq, orgSeq } = user;
  return JSON.stringify({
    stfSeq,
    stfName,
    orgSeq,
    stfNumber: userid.substring(0, 20),
    lveUnit: "DAY",
    lveType: "CUST16",
    quota,
  });
};

export const getUser = async (userid) => {
  let orgid;
  const user = await User.findOne({ where: { user_id: userid } });
  if (user) {
    if (!user.is_employed) return null;
    orgid = (
      await Department.findOne({
        where: { department_id: user.main_department_id },
      })
    )?.xft_id;
  }
  if (orgid) {
    return {
      userid: userid,
      stfSeq: user?.xft_id ?? "",
      stfName: user?.name ?? "",
      orgSeq: orgid,
    };
  }
};

export function sortDates(dates: string[]): string[] {
  return dates.sort((a, b) => {
    const [aDate, aPeriod] = a.split("/");
    const [bDate, bPeriod] = b.split("/");

    // 按照日期排序
    const dateComparison = compareAsc(new Date(aDate), new Date(bDate));
    if (dateComparison !== 0) return dateComparison;

    // 如果日期相同，按 AM/PM 排序 (AM 优先于 PM)
    return aPeriod === "AM" && bPeriod === "PM" ? -1 : 1;
  });
}

export function getDateRanges(dates: string[]): DateRange[] {
  if (dates.length === 0) return [];

  // 先排序
  const sortedDates = sortDates(dates);

  const dateRanges: DateRange[] = [];
  let currentRangeStart = sortedDates[0];
  let currentRangeEnd = sortedDates[0];

  for (let i = 1; i < sortedDates.length; i++) {
    const [currentDate, currentPeriod] = sortedDates[i].split("/");
    const [prevDate, prevPeriod] = sortedDates[i - 1].split("/");

    // 检查日期和时间段是否连续
    const isNextPeriod =
      (currentDate === prevDate &&
        prevPeriod === "AM" &&
        currentPeriod === "PM") ||
      (new Date(currentDate).getTime() - new Date(prevDate).getTime() ===
        24 * 60 * 60 * 1000 &&
        prevPeriod === "PM" &&
        currentPeriod === "AM");

    if (isNextPeriod) {
      currentRangeEnd = sortedDates[i]; // 扩展当前范围
    } else {
      // 添加前一个范围到结果
      const [begDate, begTime] = currentRangeStart.split("/");
      const [endDate, endTime] = currentRangeEnd.split("/");
      dateRanges.push({ begDate, begTime, endDate, endTime });

      // 开始新的范围
      currentRangeStart = sortedDates[i];
      currentRangeEnd = sortedDates[i];
    }
  }

  // 添加最后的范围
  const [begDate, begTime] = currentRangeStart.split("/");
  const [endDate, endTime] = currentRangeEnd.split("/");
  dateRanges.push({ begDate, begTime, endDate, endTime });

  return dateRanges;
}

export function calculateDays({
  begDate,
  begTime,
  endDate,
  endTime,
}: DateRange) {
  const beg = parseISO(begDate);
  const end = parseISO(endDate);

  // 计算两个日期之间的天数
  const daysBetween = differenceInDays(end, beg);

  // 同一天的情况
  if (begTime === endTime) {
    return daysBetween + 0.5;
  } else if (begTime === "PM" && endTime === "AM") {
    return daysBetween - 0.5; // AM 到 PM 的情况
  } else if (begTime === "AM" && endTime === "PM") {
    return daysBetween + 1; // AM 到 PM 的情况
  }
}
