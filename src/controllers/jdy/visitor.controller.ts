import { format, addHours } from "date-fns";
import { parkingApiClient } from "../../utils/parking/app";
import { ParkingInfo } from "../../entity/parking/dh_car_info";

export const 来宾预约单 = async (data) => {
  const inviteStatus = data["_widget_1623894460333"] == "派发" ? true : false;
  const time = new Date(data["_widget_1557275292430"]);
  const payload = {
    guestCompany: data["_widget_1557275291462"] ?? "",
    guestType: data["_widget_1557275291423"],
    visitorCarNum: data["_widget_1572828292176"],
    visitorName: data["_widget_1557275291478"].replace(/[，、\s]/g, ""),
    visitorPhone: data["_widget_1721036182145"],
    visitorPurpose: (data["_widget_1557275291717"] ?? []).join(","),
    visitorReason: "",
    visitorTime: format(time, "yyyy-MM-dd HH:mm:ss"),
    visitorLeaveTime: format(addHours(time, 4), "yyyy-MM-dd HH:mm:ss"),
  };
  if (inviteStatus) {
    const msg = await parkingApiClient.visitorAppoint(payload);
    if (payload.visitorCarNum) {
      ParkingInfo.create({
        id: msg.timestamp.toString(),
        ownerId: payload.guestCompany,
        ownerName: payload.visitorName,
        ownerPhone: payload.visitorPhone,
        carNum: payload.visitorCarNum,
        licensePlateColor: "",
        type: "访客车辆",
        beginTime: new Date(payload.visitorTime),
        endTime: new Date(payload.visitorLeaveTime),
      });
    }
    return msg;
  }
};
