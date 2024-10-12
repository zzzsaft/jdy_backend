import cron from "node-cron";
import { syncXft } from "./syncXftData";
import { Department } from "../entity/basic/department";
import { User } from "../entity/basic/employee";
import { logger } from "../config/logger";
import { getCheckinData } from "./getCheckinData";
import { sendtoUserwithLeaveChoice } from "./sendLeave";
import { GetFbtApply } from "./getFbtApply";
import { SendTripCheckin } from "./sendTripCheckin";
import { sendXftTodoList } from "./sendXftTask";

const syncWechat = async () => {
  await Department.updateDepartment();
  await User.updateUser();
  await Department.updateXftId();
  await User.updateXftId();
};

//每过15分钟触发任务
const checkinDateSchedule = cron.schedule("0,15,30,45 * * * *", async () => {
  await getCheckinData.getNextRawCheckinData();
});

//每过15分钟触发任务
const fbtApplySchedule = cron.schedule("5,20,35,50 * * * *", async () => {
  const hour = new Date().getHours();
  if (hour < 8 || hour > 20) {
    return;
  }
  await new GetFbtApply().getApply();
});

//每日1点触发任务
const updateUserSchedule = cron.schedule("0 1 * * *", async () => {
  await syncWechat();
  await syncXft();
  logger.info("1点更新部门人员数据");
});

//每周五下午4点触发任务
const sendLeave = cron.schedule("0 8 * * 6", async () => {
  await sendtoUserwithLeaveChoice();
  logger.info("周五下午任务");
});

const sendTripCheckin = cron.schedule("0 0-59/20 8-20 * * *", async () => {
  await SendTripCheckin.createBatchTripCheckin();
  logger.info("更新外出打卡");
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
