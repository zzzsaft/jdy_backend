import { get } from "lodash";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import { format } from "date-fns";

export class CheckinServices {
  static async getRealTimeAtd() {
    // return await xftatdApiClient.getRealTimeAtd();
  }
}
const getRealTimeAtd = async (data: {
  atdGroupSeq?;
  noScheduleClass?;
  atdAbnormal?;
}) => {
  const payload = {
    // attendanceDate: format(new Date(), "yyyy-MM-dd"),
    attendanceDate: "2024-10-17",
    attendanceItemSetType: "K",
    ...(data.atdGroupSeq && { atdGroupSeq: data.atdGroupSeq }),
    realTimeAttendanceStaQuery: {
      ...(data.noScheduleClass && { noScheduleClass: data.noScheduleClass }),
      scheduleClass: "2",
    },
    realTimeAttendanceBizQuery: {
      ...(data.atdAbnormal && { atdAbnormal: data.atdAbnormal }),
    },
    pageQueryDto: {
      pageNbr: 1,
      pageNum: 1000,
    },
  };
  const result = await xftatdApiClient.getRealTimeAtd(payload);
  if (result["returnCode"] != "SUC0000") return;
  return result["body"];
};

export const 获取未排班人员 = async () => {
  let getShiftWork = await xftatdApiClient.getAttendanceGroup({
    groupType: "2",
  });
  if (getShiftWork["returnCode"] != "SUC0000") return;
  getShiftWork = getShiftWork["body"]["attendanceGroupBaseInfoDtoList"]
    .filter((group) => !group.groupName.includes("精一"))
    .map((group) => group.groupSeq);
  const empList: any[] = [];
  for (const group of getShiftWork) {
    const data = await getRealTimeAtd({
      atdGroupSeq: group,
      noScheduleClass: "0",
      atdAbnormal: "3",
    });
    empList.push(...data["realTimeAttendanceDetailDtoList"]);
  }
};
