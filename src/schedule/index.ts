import cron from "node-cron";
import { syncXft } from "./syncXftData";
import { Department } from "../entity/wechat/Department";
import { User } from "../entity/wechat/User";
import { logger } from "../config/logger";
import { getCheckinData } from "./getCheckinData";
import { sendtoUserwithLeaveChoice } from "./sendLeave";

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

//每日1点触发任务
const updateUserSchedule = cron.schedule("0 1 * * *", async () => {
  await syncWechat();
  await syncXft();
  logger.info("1点更新部门人员数据");
});

//每周五下午4点触发任务
const sendLeave = cron.schedule("0 16 * * 5", async () => {
  await sendtoUserwithLeaveChoice();
  logger.info("周五下午任务");
});

export const schedule = [checkinDateSchedule, updateUserSchedule, sendLeave];
