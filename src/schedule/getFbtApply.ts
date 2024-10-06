import { addDays, format } from "date-fns";
import { fbtApplyApiClient } from "../utils/fenbeitong/apply";
import { FbtApply } from "../entity/fbt/apply";
import { Between } from "typeorm";
import _ from "lodash";

export const getTodayApply = async () => {
  const startTime = addDays(new Date(), -1);
  const endTime = new Date();
  const formList = await fbtApplyApiClient.getCustomFormList({
    approve_start_time: format(startTime, "yyyy-MM-dd"),
    approve_end_time: format(endTime, "yyyy-MM-dd"),
  });
  const existCode = (
    await FbtApply.find({
      where: { complete_time: Between(startTime, endTime) },
      select: ["code"],
    })
  ).map((item) => item.code);
  const result = _.difference(
    formList.map((item) => item.code),
    existCode
  );
  for (const code of result) {
    const record = await fbtApplyApiClient.getTripDetail(code);
    if (record["code"] != 0) return;
    await FbtApply.addApply(record["data"]["apply"]);
    // if (record["data"]["apply"].hasOwnProperty('parent_id')) {
    //   const parentRecord = await fbtApplyApiClient.getTripDetail(record["data"]["apply"]["parent_id"]);
    //   await FbtApply.updateApply(parentRecord["data"]["apply"]);
    // }
  }
  console.log();
};
const 添加xft差旅记录 = async () => {};

const 修改xft差旅记录 = async () => {};

const 每日获取订单 = async () => {};
