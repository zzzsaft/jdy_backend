import cron from "node-cron";
import { syncXft } from "./syncXftData";
import { Department } from "../entity/wechat/Department";
import { User } from "../entity/wechat/User";
import { logger } from "../config/logger";
import { getCheckinData } from "./getCheckinData";

const syncWechat = async () => {
  await Department.updateDepartment();
  await User.updateUser();
  await Department.updateXftId();
  await User.updateXftId();
};

//每过15分钟触发任务
const checkinDateSchedule = cron.schedule("0,15,30,45 * * * *", async () => {
  await getCheckinData.getNextRawCheckinData();
  logger.info("获取打卡数据");
});

//每日1点触发任务
const updateUserSchedule = cron.schedule("0 1 * * *", async () => {
  await syncWechat();
  await syncXft();
  logger.info("1点更新部门人员数据");
});

export const schedule = [checkinDateSchedule, updateUserSchedule];
