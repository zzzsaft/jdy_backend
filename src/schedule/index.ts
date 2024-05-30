import cron from "node-cron";
import { checkinDateSchedule } from "./getCheckinData";
import { syncXft } from "./syncXftData";
import { Department } from "../entity/wechat/Department";
import { User } from "../entity/wechat/User";
import { logger } from "../config/logger";

const syncWechat = async () => {
  await Department.updateDepartment();
  await User.updateUser();
  await Department.updateXftId();
  await User.updateXftId();
};

const checkinDateScheduleAt1 = cron.schedule("0 1 * * *", async () => {
  await syncWechat();
  await syncXft();
  logger.info("checkinDateScheduleAt1, update user list and department list");
});

export const schedule = [...checkinDateSchedule, checkinDateScheduleAt1];
