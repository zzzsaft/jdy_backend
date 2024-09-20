import { WechatMessage } from "../../entity/wechat/message";
import { getDateRanges } from "../../schedule/sendLeave";
import { xftatdApiClient } from "../../utils/xft/xft_atd";
import { xftOAApiClient } from "../../utils/xft/xft_oa";
import { LeaveEvent } from "../xft/leave.atd.xft.controller";
import { XftTaskEvent } from "../xft/todo.xft.controller";

export const handleMessageEvent = async (msg: any) => {
  const eventKey = msg["EventKey"]["value"];
  const taskId = msg["TaskId"]["value"];
  const responseCode = msg["ResponseCode"]["value"];
  await WechatMessage.updateResponseCode(taskId, responseCode);
  const msgId = await WechatMessage.findOne({ where: { taskId: taskId } });
  if (msgId?.eventType == "xft") {
    await xftMsg(eventKey);
  }
  if (msgId?.eventType == "general") {
    await xftLeave(msg, eventKey);
  }
};

const xftMsg = async (key) => {
  const result = await xftOAApiClient.operate(JSON.parse(key));
};

const xftLeave = async (msg, key) => {
  const selectedItem = msg?.["SelectedItems"]?.["SelectedItems"];
  const questionKey = selectedItem?.["QuestionKey"]?.["value"];
  if (questionKey != "leave") return;
  const optionIds = selectedItem?.["OptionIds"]?.["OptionId"].map(
    (optionId) => optionId["value"]
  );
  const config = JSON.parse(key);
  if (optionIds.length * 2 > config["quota"]) return;
  for (const range of getDateRanges(optionIds)) {
    const record = await xftatdApiClient.addLeave({ ...config, ...range });
    if (record["returnCode"] !== "SUC0000") {
      const leave = new LeaveEvent(new XftTaskEvent());
      await leave.proceedRecord(record);
      await leave.sendNotice(leave.stfNumber, "已自动通过");
    }
  }
};
