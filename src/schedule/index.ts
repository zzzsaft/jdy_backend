import cron from "node-cron";
import { checkinDateSchedule } from "./getCheckinData";
import { checkinDateScheduleAt1 } from "./wechat";

const getCheckin1 = cron.schedule("* * 8 * * *", () => {
  console.log("");
});

export const start_cron = () => {
  getCheckin1.start();
};

export const schedule = [...checkinDateSchedule, checkinDateScheduleAt1];
