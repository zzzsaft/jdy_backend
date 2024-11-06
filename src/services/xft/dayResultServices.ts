import _ from "lodash";
import { User } from "../../entity/basic/employee";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import { addDays, endOfMonth, format, isBefore, startOfMonth } from "date-fns";
import { AtdDayResult } from "../../entity/atd/day_result";
import { logger } from "../../config/logger";

class DayResultServices {
  getDayResult = async (date: Date = new Date()) => {
    const atd = await xftatdApiClient.getDayResult({
      // staffNumber: "ZhengJie",
      attendanceDate: format(date, "yyyy-MM-dd"),
    });
    const users = await User.find();
    const data: AtdDayResult[] = [];
    for (const dto of atd["body"]["dayStaDtoList"]) {
      const result = JSON.parse(dto.attendanceItemResult);
      const user = users.find((user) => user.xft_id == dto.staffSeq);
      if (!user || user.user_id != dto.staffNumber) {
        logger.error(`User not found at getDayResult: ${dto.staffSeq}`);
        continue;
      }
      result["userId"] = user?.user_id;
      result["name"] = user?.name;
      result["departmentId"] = user?.main_department_id;
      data.push(AtdDayResult.createAttendanceData(result));
    }
    for (const dt of _.chunk(data, 500)) {
      await AtdDayResult.upsert(dt, ["date", "userId"]);
    }
  };
  async getMonthResult(date: Date = new Date()) {
    const startOfMonthDate = startOfMonth(date);
    const endOfMonthDate = isBefore(endOfMonth(date), new Date())
      ? endOfMonth(date)
      : new Date();

    // 循环当前月的每一天
    for (
      let currentDate = startOfMonthDate;
      currentDate <= endOfMonthDate;
      currentDate = addDays(currentDate, 1)
    ) {
      await this.getDayResult(currentDate);
    }
  }
}
export const dayResultServices = new DayResultServices();
