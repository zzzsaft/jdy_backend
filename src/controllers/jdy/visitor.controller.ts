import { format, addHours } from "date-fns";
import { parkingApiClient } from "../../utils/parking/app";

export const 来宾预约单 = async (data) => {
  const time = new Date(data["_widget_1557275292430"]);
  const guestCompany = data["_widget_1557275291462"] ?? "";
  const guestType = data["_widget_1557275291423"];
  const inviteStatus = data["_widget_1623894460333"] == "派发" ? 1 : 0;
  const visitorCarNum = data["_widget_1572828292176"];
  const visitorName = data["_widget_1557275291478"];
  const visitorPhone = data["_widget_1721036182145"];
  const visitorPurpose = data["_widget_1557275291717"];
  const visitorReason = data[""];
  const visitorTime = format(time, "yyyy-MM-dd HH:mm:ss");
  const visitorLeaveTime = format(addHours(time, 2), "yyyy-MM-dd HH:mm:ss");
  const msg = await parkingApiClient.visitorAppoint({
    guestCompany,
    guestType,
    inviteStatus,
    visitorCarNum,
    visitorLeaveTime,
    visitorName,
    visitorPhone,
    visitorPurpose,
    visitorReason,
    visitorTime,
  });
  return msg;
};
