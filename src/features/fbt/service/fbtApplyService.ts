import { format } from "date-fns";
import _ from "lodash";
import { FbtApply } from "../entity/fbt_trip_apply";
import { Between } from "typeorm";
import { fbtApplyApiClient } from "../api/apply";

export class FbtApplyService {
  static async syncFbtApplies(startTime: Date, endTime: Date) {
    const formList = await FbtApplyService.getApplyList(startTime, endTime);
    const unexistApply = await FbtApplyService.calculateUnexistApply(
      formList,
      startTime,
      endTime
    );
    const applies: FbtApply[] = [];
    for (const code of unexistApply) {
      const record = await FbtApplyService.getApplyDetail(code);
      const applyDb = await FbtApplyService.addApplyToDb(record);
      if (applyDb) applies.push(applyDb);
    }
    return applies;
  }

  static async getApplyList(startTime: Date, endTime: Date) {
    return await fbtApplyApiClient.getCustomFormList({
      approve_start_time: format(startTime, "yyyy-MM-dd"),
      approve_end_time: format(endTime, "yyyy-MM-dd"),
    });
  }

  static async calculateUnexistApply(
    formList: { code: string }[],
    startTime: Date,
    endTime: Date
  ) {
    const existCode = (
      await FbtApply.find({
        where: { complete_time: Between(startTime, endTime) },
        select: ["code"],
      })
    ).map((item) => item.code);
    return _.difference(
      formList.map((item) => item.code),
      existCode
    );
  }

  static async getApplyDetail(id: string) {
    const record = await fbtApplyApiClient.getTripDetail(id);
    if (record["code"] === 0) return record["data"]["apply"];
    throw new Error(
      `FbtApplyService.getApplyDetail: Error fetching details for id ${id}: ${record["message"]}`
    );
  }

  static async addApplyToDb(record: any) {
    const apply = await FbtApply.addApply(record);
    if (!apply.parent_id) return apply;
    const parentApplyState = (
      await FbtApply.findOne({
        where: { id: apply.parent_id },
        select: ["state"],
      })
    )?.state;
    if (parentApplyState != 2048) {
      const parentApply = await FbtApplyService.getApplyDetail(apply.parent_id);
      await FbtApply.updateApply(parentApply);
    }
    return apply;
  }
}
