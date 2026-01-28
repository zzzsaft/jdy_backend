import cron from "node-cron";
import { syncXft } from "./syncXftData";
import { logger } from "../config/logger";
import { getCheckinData } from "./getCheckinData";
import { sendtoUserwithLeaveChoice } from "./sendLeave";
import { GetFbtApply } from "./getFbtApply";
import { SendTripCheckin } from "./sendTripCheckin";
import { sendXftTodoList } from "./sendXftTask";
import { businessTripCheckinServices } from "../features/jdy/service/businessTripCheckinServices";
import { BusinessTripServices } from "../features/xft/service/businessTripServices";
import { checkinServices } from "../services/xft/checkinServices";
import { dayResultServices } from "../services/xft/dayResultServices";
import { addDays } from "date-fns";
import { syncWechatData } from "../services/wechatSyncService";

//每过15分钟触发任务
const checkinDateSchedule = cron.schedule("0,15,30,45 * * * *", async () => {
  const hours = new Date().getHours();
  if (hours > 7 && hours < 23) await checkinServices.scheduleCheckin();
});

let fbtApplyRunning = false;
//每过15分钟触发任务
const fbtApplySchedule = cron.schedule("5,20,35,50 * * * *", async () => {
  if (fbtApplyRunning) {
    logger.warn("fbtApplySchedule skipped: previous run still in progress");
    return;
  }
  fbtApplyRunning = true;
  try {
    await new GetFbtApply().getApply();
    await BusinessTripServices.scheduleCreate();
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 23) {
      await businessTripCheckinServices.scheduleCreate();
    }
  } finally {
    fbtApplyRunning = false;
  }
});

//每日1点触发任务
const updateUserSchedule = cron.schedule("0 2 * * *", async () => {
  await syncWechatData();
  await syncXft();
  await checkinServices.scheduleCheckinDaily();
  logger.info("1点更新部门人员数据");
  await dayResultServices.getDayResult(addDays(new Date(), -1));
});

//每周五下午4点触发任务
const sendLeave = cron.schedule("0 16 * * 5", async () => {
  await sendtoUserwithLeaveChoice();
  logger.info("周五下午任务");
});

const sendTripCheckin = cron.schedule("0 */20 7-20 * * *", async () => {
  await businessTripCheckinServices.scheduleCreate();
  // logger.info("更新外出打卡");
});

const sendXftTodoListEveryDay = cron.schedule("0 0 9,16 * * *", async () => {
  await sendXftTodoList();
  logger.info("发送待办");
});

export const schedule = [
  checkinDateSchedule,
  updateUserSchedule,
  sendLeave,
  fbtApplySchedule,
  sendTripCheckin,
  sendXftTodoListEveryDay,
];
