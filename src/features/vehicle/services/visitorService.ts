import { addHours, format, isBefore } from "date-fns";
import { parkingApiClient } from "../api/app";
import { ParkingInfo } from "../entity/vehicle_info";

const normalizePhone = (phone?: string) => {
  if (!phone) return "";
  const cleaned = String(phone).replace(/\s|-/g, "");
  return /^1\d{10}$/.test(cleaned) ? cleaned : "";
};

const normalizeName = (name?: string) => (name ?? "").replace(/[，、\s]/g, "");

const getVisitTimes = (data) => {
  const beginRaw = data["_widget_1557275292430"];
  const endRaw = data["_widget_1557275292431"];
  const beginTime = beginRaw ? new Date(beginRaw) : new Date();
  let endTime = endRaw ? new Date(endRaw) : addHours(beginTime, 12);
  if (isBefore(endTime, beginTime)) {
    endTime = addHours(beginTime, 12);
  }
  return { beginTime, endTime };
};

const buildPayload = (data) => {
  const { beginTime, endTime } = getVisitTimes(data);
  const visitorPhone = normalizePhone(data["_widget_1721036182145"]);
  const payload = {
    guestCompany: data["_widget_1557275291462"] ?? "",
    guestType: data["_widget_1557275291423"],
    visitorCarNum: data["_widget_1572828292176"],
    visitorName: normalizeName(data["_widget_1557275291478"]),
    visitorPhone,
    visitorPurpose: (data["_widget_1557275291717"] ?? []).join(","),
    visitorReason: "",
    visitorTime: format(beginTime, "yyyy-MM-dd HH:mm:ss"),
    visitorLeaveTime: format(endTime, "yyyy-MM-dd HH:mm:ss"),
    area: "dream",
  };
  return { payload, beginTime, endTime };
};

class VisitorService {
  async handleInvite(data) {
    const inviteStatus = data["_widget_1623894460333"] == "派发";
    const { payload, beginTime, endTime } = buildPayload(data);
    if (!inviteStatus) return;
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
        beginTime,
        endTime,
      });
    }
    return msg;
  }
}

export const visitorService = new VisitorService();
