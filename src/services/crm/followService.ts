import { XftTripCheckin } from "../../entity/atd/business_trip_checkin";
import { WechatMessage } from "../../entity/log/log_message";
import { JdyUtil } from "../../utils/jdyUtils";
import { businessTripCheckinServices } from "../../features/jdy/service/businessTripCheckinServices";
import { MessageService } from "../../features/wechat/service/messageService";
import { checkinServices } from "../xft/checkinServices";
import { workflowApiClient } from "../../features/jdy/api/workflow";

class FollowService {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "020100400000000000000001";
  dataCreate = async (appid, entryid, op, data) => {
    if (appid != this.appid || entryid != this.entryid || op != "data_create")
      return;
    const follow_time = JdyUtil.getDate(data["follow_time"]);
    const submit_time = JdyUtil.getDate(data["_widget_1747298549384"]);
    const userid = JdyUtil.getUser(data["executor"])?.username;
    const isToday = data["_widget_1747298549386"];
    const follow_way = data["follow_way"];
    if (follow_way != "当面拜访") return;
    const checkin = await this.findCheckin(userid, follow_time);
    if (!checkin) return;
    checkin.checkinTime = submit_time;
    if (isToday == "当日") {
      checkin.state = "当日打卡";
    } else {
      checkin.state = "次日补卡";
    }
    await checkin.save();
    await checkinServices.addCheckinRecord([checkin]);
    await this.findMessage(checkin);
    if (checkin.jdyId) {
      await workflowApiClient.workflowInstanceClose(checkin.jdyId);
      await businessTripCheckinServices.updateJdyData(
        checkin.jdyId,
        checkin.state
      );
    }
  };
  findCheckin = async (userId, checkinDate) => {
    return await XftTripCheckin.findOne({
      where: {
        userId,
        checkinDate,
      },
    });
  };
  findMessage = async (checkin: XftTripCheckin) => {
    const wm = await WechatMessage.findOne({
      where: { eventType: "checkin", eventId: checkin.id.toString() },
    });
    if (!wm) return;
    await new MessageService([checkin.userId]).disableButton(
      wm,
      `已打卡 id:${checkin.id}`
    );
  };
}

export const followService = new FollowService();
