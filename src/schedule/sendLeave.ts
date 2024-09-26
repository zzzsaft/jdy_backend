import { MessageHelper } from "../utils/wechat/message";
import { endOfWeek, format, getISOWeek, compareAsc } from "date-fns";
import { xftatdApiClient } from "../utils/xft/xft_atd";
import { LeaveEvent } from "../controllers/xft/leave.atd.xft.controller";
import { XftTaskEvent } from "../controllers/xft/todo.xft.controller";

const getWeekendDates = () => {
  const today = new Date();

  // 获取周六的日期（将周日作为一周的起始，因此周六是默认的一周的最后一天）
  const saturday = endOfWeek(today, { weekStartsOn: 1 }); // weekStartsOn: 1 表示周一为一周的开始
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1); // 周日是周六的第二天

  return { saturday, sunday };
};

const generateCheckBox = () => {
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
      text: `${format(saturday, "MM/dd")} 周日上午`,
      is_checked: false,
    },
    {
      id: `${format(sunday, "yyyy-MM-dd")}/PM`,
      text: `${format(sunday, "MM/dd")} 周日下午`,
      is_checked: false,
    },
  ];
};
const generateLeaveConfig = (
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
export const sendLeave = async (
  user: { userid: string; stfSeq: string; stfName: string; orgSeq: string },
  quota: number
) => {
  const { userid, stfName, stfSeq, orgSeq } = user;
  const isoWeekNumber = getISOWeek(new Date());
  const eventId = `${userid}-${isoWeekNumber}`;
  new MessageHelper([userid]).sendVoteInteraction({
    main_title: {
      title: "轮休假申请",
      desc: `本月轮休假剩余${quota}天，可在下方勾选想要请假的时间，提交后将自动生效。如果需要取消假期，请进入薪福通系统进行操作。`,
    },
    event: {
      eventId,
      eventType: "general",
    },
    checkbox: {
      question_key: "leave",
      mode: 1,
      option_list: generateCheckBox(),
    },
    submit_button: {
      text: "提交",
      key: generateLeaveConfig(user, quota),
    },
  });
};

interface DateRange {
  begDate: string;
  begTime: string;
  endDate: string;
  endTime: string;
}

function sortDates(dates: string[]): string[] {
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

export const proceedLeave = async (optionIds, config) => {
  if (optionIds.length * 2 > config["quota"]) return;
  for (const range of getDateRanges(optionIds)) {
    const record = await xftatdApiClient.addLeave({ ...config, ...range });
    if (record["returnCode"] !== "SUC0000") {
      const leave = new LeaveEvent(new XftTaskEvent());
      await leave.proceedRecord(record);
      await leave.sendNotice(leave.stfNumber, "已自动通过");
    }
  }
};

// const quota = await xftatdApiClient.getQuota(
//   format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
//   format(endOfMonth(new Date()), "yyyy-MM-dd")
// );
