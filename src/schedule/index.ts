import cron from "node-cron";
import { syncXft } from "./syncXftData.js";
import { logger } from "../config/logger.js";
import { getCheckinData } from "./getCheckinData.js";
import { sendtoUserwithLeaveChoice } from "./sendLeave.js";
import { GetFbtApply } from "./getFbtApply.js";
import { SendTripCheckin } from "./sendTripCheckin.js";
import { businessTripCheckinServices } from "../features/jdy/service/businessTripCheckinServices.js";
import { BusinessTripServices } from "../features/xft/service/businessTripServices.js";
import { checkinServices } from "../features/xft/service/checkinServices.js";
import { dayResultServices } from "../features/xft/service/dayResultServices.js";
import { addDays } from "date-fns";
import { syncWechatData } from "../features/wechat/service/wechatSyncService.js";
import { vehicleService } from "../features/vehicle/services/vehicleService.js";

const guardedSchedule = (
  name: string,
  expression: string,
  handler: () => Promise<void>
) => {
  let running = false;
  return cron.schedule(expression, async () => {
    if (running) {
      logger.warn(`${name} skipped: previous run still in progress`);
      return;
    }
    running = true;
    try {
      await handler();
    } catch (error) {
      logger.error(
        `${name} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      running = false;
    }
  });
};

//每过15分钟触发任务
const checkinDateSchedule = guardedSchedule(
  "checkinDateSchedule",
  "0,15,30,45 * * * *",
  async () => {
    const hours = new Date().getHours();
    if (hours > 7 && hours < 23) await checkinServices.scheduleCheckin();
  }
);

//每过15分钟触发任务
const fbtApplySchedule = guardedSchedule(
  "fbtApplySchedule",
  "5,20,35,50 * * * *",
  async () => {
    await new GetFbtApply().getApply();
    await BusinessTripServices.scheduleCreate();
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 23) {
      await businessTripCheckinServices.scheduleCreate();
    }
  }
);

//每日1点触发任务
const updateUserSchedule = guardedSchedule(
  "updateUserSchedule",
  "0 2 * * *",
  async () => {
    await syncWechatData();
    await syncXft();
    await checkinServices.scheduleCheckinDaily();
    logger.info("1点更新部门人员数据");
    await dayResultServices.getDayResult(addDays(new Date(), -1));
  }
);

//每周五下午4点触发任务
const sendLeave = guardedSchedule("sendLeave", "0 16 * * 5", async () => {
  await sendtoUserwithLeaveChoice();
  logger.info("周五下午任务");
});

const sendTripCheckin = guardedSchedule(
  "sendTripCheckin",
  "0 */20 7-20 * * *",
  async () => {
    await businessTripCheckinServices.scheduleCreate();
    // logger.info("更新外出打卡");
  }
);

// 每天晚上10点执行离职人员车辆禁用
const disableLeftUserCars = guardedSchedule(
  "disableLeftUserCars",
  "0 0 22 * * *",
  async () => {
    await vehicleService.disableCarIfUserLeft();
    logger.info("离职人员车辆禁用完成");
  }
);

const productConfigAgentDailyMaintenance = guardedSchedule(
  "productConfigAgentDailyMaintenance",
  "30 2 * * *",
  async () => {
    await productConfigAgentDailyMaintenanceService.runDailyMaintenance();
  }
);

export const schedule = [
  checkinDateSchedule,
  updateUserSchedule,
  sendLeave,
  fbtApplySchedule,
  sendTripCheckin,
  disableLeftUserCars,
];
