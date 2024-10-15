import { BusinessTrip } from "../../entity/atd/businessTrip";
import { FbtApply } from "../../entity/atd/fbt_trip_apply";
import { adjustToTimeNode } from "../../utils/dateUtils";
export class FbtApplyServices {
  static async createNonConflictingTimeSlot(fbtApply: FbtApply) {
    const start_time = new Date(fbtApply.start_time);
    const end_time = new Date(fbtApply.end_time);
    const create_time = new Date(fbtApply.create_time);
    const conflicts = (
      await BusinessTrip.getConflict(
        fbtApply.proposerUserId,
        start_time,
        end_time,
        create_time
      )
    ).filter((conflict) => conflict.fbtRootId != fbtApply.root_id);
    if (conflicts.length > 0) {
      // 处理冲突并生成新的时间段
      let newStartTime = start_time;
      let newEndTime = end_time;

      for (const conflict of conflicts) {
        if (!conflict.start_time || !conflict.end_time) continue;
        if (
          conflict.start_time <= newStartTime &&
          conflict.end_time >= newEndTime
        ) {
          // 如果有冲突记录完全覆盖输入的时间段，则返回null
          return null;
        }

        if (
          conflict.start_time <= newEndTime &&
          conflict.end_time >= newStartTime
        ) {
          // 如果输入的时间段和数据库记录有重叠
          if (conflict.end_time < newEndTime) {
            // 调整开始时间，避免与冲突记录重叠
            newStartTime = adjustToTimeNode(
              new Date(conflict.end_time.getTime() + 1 * 1000)
            ); // 冲突的结束时间 + 1秒
          }
          if (conflict.start_time > newStartTime) {
            // 调整结束时间，避免与冲突记录重叠
            newEndTime = adjustToTimeNode(
              new Date(conflict.start_time.getTime() - 1 * 1000),
              true
            ); // 冲突的开始时间 - 1秒
          }
        }
      }
      return { start_time: newStartTime, end_time: newEndTime };
    }
    // 如果没有冲突，则直接返回原始的时间段
    return { start_time: adjustToTimeNode(start_time), end_time };
  }
}
