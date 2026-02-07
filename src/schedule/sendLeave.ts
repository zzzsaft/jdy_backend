import { getISOWeek, isEqual, startOfMonth } from "date-fns";
import { sleep } from "../config/limiter";
import { XftAtdLeave } from "../entity/atd/xft_leave";
import _ from "lodash";
import { getWeekDayName } from "../utils/dateUtils";
import { quotaServices } from "../features/xft/service/quotaServices";
import { MessageService } from "../features/wechat/service/messageService";
import { xftatdApiClient } from "../features/xft/api/xft_atd";
import {
  calculateDays,
  generateCheckBox,
  generateLeaveConfig,
  getDateRanges,
  getUser,
  getWeekendDates,
} from "../features/xft/service/leaveService";
import { User } from "../entity/basic/employee";

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
