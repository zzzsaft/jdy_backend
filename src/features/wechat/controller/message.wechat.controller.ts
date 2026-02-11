import { WechatMessage } from "../../log/entity/log_message";
import { xftOAApiClient } from "../../xft/api/xft_oa";
import { proceedLeave } from "../../../schedule/sendLeave";
import { trafficService } from "../../../services/entryService";
import { MessageService } from "../service/messageService";

export const handleMessageEvent = async (msg: any) => {
  const eventKey = msg["EventKey"]["value"];
  const taskId = msg["TaskId"]["value"];
  const responseCode = msg["ResponseCode"]["value"];
  const user = msg["FromUserName"]["value"];
  await MessageService.updateResponseCode(taskId, responseCode);
  const msgId = await WechatMessage.findOne({ where: { taskId: taskId } });
  // if (msgId?.disabled) return;
  if (msgId?.eventType == "xft") {
    await xftMsg(msgId, eventKey);
  }
  if (msgId?.eventType == "checkin") {
    await xftMsg(msgId, eventKey);
  }
  if (msgId?.eventType == "general") {
    await xftLeave(msg, eventKey, user, msgId);
  }
  if (msgId?.eventType == "traffic") {
    await trafficService.leaderConfirm(JSON.parse(eventKey));
    await new MessageService([user]).disableButton(msgId, "已完成");
  }
};

const xftMsg = async (msgId: WechatMessage, key) => {
  const result = await xftOAApiClient.operate(JSON.parse(key));
  if (result["returnCode"] == "SUC0000") {
    msgId.disabled = true;
    await msgId.save();
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
    await new MessageService([user]).disableButton(msgId, "已完成");
  }
};
const a = {
  ToUserName: { value: "wwd56c5091f4258911" },
  FromUserName: { value: "LiangJi" },
  MsgType: { value: "event" },
  Event: { value: "template_card_event" },
  CreateTime: { value: "1729241783" },
  AgentID: { value: "1000061" },
  EventKey: {
    value:
      '{"stfSeq":"0000000009","stfName":"梁骥","orgSeq":"0072","stfNumber":"LiangJi","lveUnit":"DAY","lveType":"CUST16","quota":3}',
  },
  TaskId: { value: "ee44ce3d-621f-4e28-8755-e2276b1027df" },
  CardType: { value: "vote_interaction" },
  SelectedItems: {
    SelectedItem: {
      QuestionKey: { value: "leave" },
      OptionIds: {
        OptionId: [{ value: "2024-10-20/AM" }, { value: "2024-10-20/PM" }],
      },
    },
  },
  ResponseCode: { value: "Am0jw1GYXWn8sRjyUszT71F_WkNe1tIG3I9GAzxK7P4" },
};
export const testaaaaa = async () => await handleMessageEvent(a);
