import { WechatMessage } from "../../entity/wechat/message";
import { proceedLeave } from "../../schedule/sendLeave";
import { MessageHelper } from "../../utils/wechat/message";
import { xftatdApiClient } from "../../utils/xft/xft_atd";
import { xftOAApiClient } from "../../utils/xft/xft_oa";
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
  const optionIds = selectedItem?.["OptionIds"]?.["OptionId"].map(
    (optionId) => optionId["value"]
  );
  const config = JSON.parse(key);
  let flag = await proceedLeave(optionIds, config, user);
  if (flag) {
    await new MessageHelper([user]).disableButton(msgId.responseCode, "已完成");
    await WechatMessage.disable(msgId.taskId);
  }
};
const a = {
  ToUserName: { value: "wwd56c5091f4258911" },
  FromUserName: { value: "LiangZhi" },
  MsgType: { value: "event" },
  Event: { value: "template_card_event" },
  CreateTime: { value: "1727802657" },
  AgentID: { value: "1000061" },
  EventKey: {
    value:
      '{"stfSeq":"0000000001","stfName":"梁之","orgSeq":"0085","stfNumber":"LiangZhi","lveUnit":"DAY","lveType":"CUST16","quota":5}',
  },
  TaskId: { value: "a301aaf6-429a-49af-bb77-63b1603384fb" },
  CardType: { value: "vote_interaction" },
  SelectedItems: {
    SelectedItem: {
      QuestionKey: { value: "leave" },
      OptionIds: {
        OptionId: [{ value: "2024-10-06/AM" }, { value: "2024-10-06/PM" }],
      },
    },
  },
  ResponseCode: { value: "O_UsvgZL8ryPuVekBcBGYsntInlFyVAWMGMSDJjPZFo" },
};
export const testaaaaa = async () => await handleMessageEvent(a);
