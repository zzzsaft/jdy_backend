import _ from "lodash";
import { XftAtdClass } from "../../entity/atd/xft_class";
import {
  getDifference,
  isTimeInRanges,
  parseTimeRange,
} from "../../utils/dateUtils";
import { dayResultServices } from "./dayResultServices";
import { xftatdApiClient } from "../../features/xft/api/xft_atd";

class AtdClassService {
  async updateAtdClass() {
    const atdClass = await xftatdApiClient.getClass();
    if (atdClass["returnCode"] != "SUC0000") return;
    for (const content of atdClass["body"])
      await XftAtdClass.create(content).save();
  }
  async getClassWorkTime(classSeq: string) {
    const atdClass = await XftAtdClass.findOne({ where: { classSeq } });
    if (!atdClass) return;
    const result = atdClass.classTimeDtos
      .filter((dto) => dto.classTimeType == "1")
      .map((dto) => dto.clockTime);
    return result;
  }
  async getClosedTime(classesSeq: string, time: string) {
    // const workTimes = await this.getClassWorkTime(classesSeq);
    const atdClass = await XftAtdClass.findOne({
      where: { classSeq: classesSeq },
    });
    if (!atdClass) return;
    const closestTimeEntry = _.minBy(atdClass.classTimeDtos, (entry: any) =>
      Math.abs(getDifference(time, entry.clockTime) ?? 0)
    );
    return closestTimeEntry?.classTimeType ?? null;
  }
  validWorkTime = async (className: string, time: Date, baseDate = time) => {
    const times = await XftAtdClass.findOne({ where: { className } });
    if (!times) return false;
    const intervals = times.workTime.split(" ").filter((x) => x);
    return isTimeInRanges(intervals, time, baseDate);
  };
  getWorkStartTime = async (userid: string, time: Date) => {
    const shift = await dayResultServices.getShift(time, userid);
    const atdClass = await XftAtdClass.findOne({
      where: { className: shift },
    });
    if (!atdClass) return null;
    const workTimes = atdClass.workTime.split(" ").filter((x) => x);
    for (const workTime of workTimes) {
      const range = parseTimeRange(workTime, time);
      return range.start;
    }
  };
}
export const atdClassService = new AtdClassService();
