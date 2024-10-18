import { WechatMessage } from "../../entity/log/log_wx_message";
import { proceedLeave } from "../../schedule/sendLeave";
import { MessageHelper } from "../../api/wechat/message";
import { xftatdApiClient } from "../../api/xft/xft_atd";
import { xftOAApiClient } from "../../api/xft/xft_oa";
import { LeaveEvent } from "../xft/atd/leave.atd.xft.controller";
import { XftTaskEvent } from "../xft/todo.xft.controller";

export const handleMessageEvent = async (msg: any) => {
  const eventKey = msg["EventKey"]["value"];
  const taskId = msg["TaskId"]["value"];
  const responseCode = msg["ResponseCode"]["value"];
  const user = msg["FromUserName"]["value"];
  await WechatMessage.updateResponseCode(taskId, responseCode);
  const msgId = await WechatMessage.findOne({ where: { taskId: taskId } });
  if (msgId?.disabled) return;
  if (msgId?.eventType == "xft") {
    await xftMsg(taskId, eventKey);
  }
  if (msgId?.eventType == "general") {
    await xftLeave(msg, eventKey, user, msgId);
  }
};

const xftMsg = async (taskId, key) => {
  const result = await xftOAApiClient.operate(JSON.parse(key));
  if (result["returnCode"] !== "SUC0000") {
    await WechatMessage.disable(taskId);
  }
};

const xftLeave = async (msg, key, user, msgId: WechatMessage) => {
  const selectedItem = msg?.["SelectedItems"]?.["SelectedItem"];
  const questionKey = selectedItem?.["QuestionKey"]?.["value"];
  if (questionKey != "leave") return;
  const OptionId = selectedItem?.["OptionIds"]?.["OptionId"];
  // .map(
  //   (optionId) => optionId["value"]
  // );
  const optionIds = Array.isArray(OptionId)
    ? OptionId.map((optionId) => optionId["value"]) // 如果是数组，使用 map
    : OptionId?.["value"]
    ? [OptionId["value"]]
    : []; // 如果是对象，取出 value 并放入数组
  const config = JSON.parse(key);
  let flag = await proceedLeave(optionIds, config, user);
  if (flag) {
    await new MessageHelper([user]).disableButton(msgId.responseCode, "已完成");
    await WechatMessage.disable(msgId.taskId);
  }
};
const a = {
  // xml: {
  ToUserName: { value: "wwd56c5091f4258911" },
  FromUserName: { value: "LiangJi" },
  CreateTime: { value: "1729241885" },
  MsgType: { value: "event" },
  AgentID: { value: "1000061" },
  Event: { value: "LOCATION" },
  Latitude: { value: "28.6498" },
  Longitude: { value: "121.209" },
  Precision: { value: "4" },
  AppType: { value: "wxwork" },
  // },
};
export const testaaaaa = async () => await handleMessageEvent(a);
