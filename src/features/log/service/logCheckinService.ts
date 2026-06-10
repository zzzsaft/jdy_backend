import { LogCheckin } from "../entity/log_checkin.js";

export async function getLastDate() {
  const lastLog = await LogCheckin.find({
    order: {
      EndDate: "DESC",
    },
    take: 1,
  });

  return lastLog ? lastLog[0].EndDate : new Date("2024-08-31");
}
