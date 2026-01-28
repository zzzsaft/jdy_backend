import {
  endOfWeek,
  format,
  getISOWeek,
  compareAsc,
  parseISO,
  differenceInDays,
  startOfDay,
  endOfDay,
  isEqual,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { XftTaskEvent } from "../controllers/xft/todo.xft.controller";
import { User } from "../entity/basic/employee";
import { Department } from "../entity/basic/department";
import { sleep } from "../config/limiter";
import { XftAtdLeave } from "../entity/atd/xft_leave";
import _ from "lodash";
import { getWeekDayName } from "../utils/dateUtils";
import { quotaServices } from "../services/xft/quotaServices";
import { MessageService } from "../features/wechat/service/messageService";
import { xftatdApiClient } from "../features/xft/api/xft_atd";

export const getWeekendDates = () => {
  const today = new Date();

  // 获取周六的日期（将周日作为一周的起始，因此周六是默认的一周的最后一天）
  const saturday = startOfDay(endOfWeek(today, { weekStartsOn: 0 })); // weekStartsOn: 1 表示周一为一周的开始
  const sunday = endOfDay(new Date(saturday));
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
  new MessageService([userid]).sendVoteInteraction({
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

export const sendtoUserwithLeaveChoiceTest = async () => {
  const user = await getUser("LiangZhi");
  if (user) sendLeave(user, 5);
};

export const sendtoUserwithLeaveChoice = async () => {
  const { saturday, sunday } = getWeekendDates();
  let allQuota = await quotaServices.getAllSingleDayOffQuotaLeft();
  const userids = await XftAtdLeave.getUsersInRange(saturday, sunday);
  allQuota = _.omit(allQuota, userids);
  for (const key in allQuota) {
    const quota = allQuota[key];
    if (quota.total >= 5) {
      const user = await getUser(key);
      if (user && user.userid.length < 19) {
        if (quota.left === 0) {
          await new MessageService([user.userid]).send_plain_text(
            "轮休假已用完，本周末没有轮休假 如需请假，请走薪福通-请假流程"
          );
        } else {
          if (isEqual(sunday, startOfMonth(sunday))) {
            quota.left = quota.left + 1;
          }
          // console.log(user, quota.left);
          await sendLeave(user, quota.left);
          await sleep(100);
        }
      }
    }
  }
};

interface DateRange {
  begDate: string;
  begTime: string;
  endDate: string;
  endTime: string;
}

export const proceedLeave = async (optionIds, config, user) => {
  let flag = false;
  if (optionIds.length / 2 > config["quota"]) {
    new MessageService([user]).send_plain_text(
      "您选择的日期范围超过了剩余的轮休假天数，请重新选择。"
    );
    return flag;
  }
  let leaders = await User.getLeaderId(user);
  if (user == "LiangZhi") leaders = ["LiangZhi"];
  // const leaders = [];
  const name = (await User.findOne({ where: { user_id: user } }))?.name;
  for (const range of getDateRanges(optionIds)) {
    const record = await xftatdApiClient.addLeave({ ...config, ...range });
    if (record["returnCode"] == "SUC0000") {
      flag = true;
      const rRecords = await xftatdApiClient.getLeaveRecord(user);
      if (rRecords["returnCode"] == "SUC0000")
        for (const rRecord of rRecords["body"]["list"]) {
          if (record["lveTypeName"] == "轮休假") {
            await XftAtdLeave.addRecord(rRecord);
          }
        }
      new MessageService([user, ...leaders]).sendTextNotice({
        main_title: {
          title: `(已自动通过)${name}的轮休假申请`,
          desc: record["body"]?.["createTime"] ?? "",
        },
        sub_title_text: "",
        card_action: {
          type: 1,
          url: "https://xft.cmbchina.com/mobile-atd/#/vacation-record",
        },
        horizontal_content_list: [
          { keyname: "请假类型", value: "轮休假" },
          {
            keyname: "开始时间",
            value: `${range.begDate} ${range.begTime} (${getWeekDayName(
              range.begDate
            )})`,
          },
          {
            keyname: "结束时间",
            value: `${range.endDate} ${range.endTime} (${getWeekDayName(
              range.endDate
            )})`,
          },
          {
            keyname: "请假时长",
            value: `${calculateDays(range)}天`,
          },
        ],
      });
    } else {
      new MessageService([user]).send_plain_text(record["errorMsg"]);
      flag = false;
    }
  }
  return flag;
};

const getUser = async (userid) => {
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

function getDateRanges(dates: string[]): DateRange[] {
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

function calculateDays({ begDate, begTime, endDate, endTime }: DateRange) {
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
