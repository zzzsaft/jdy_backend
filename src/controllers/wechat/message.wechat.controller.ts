import { WechatMessage } from "../../entity/wechat/message";
import { xftOAApiClient } from "../../utils/xft/xft_oa";

export const handleMessageEvent = async (msg: any) => {
  const eventKey = msg["EventKey"]["value"];
  const taskId = msg["TaskId"]["value"];
  const responseCode = msg["ResponseCode"]["value"];
  await WechatMessage.updateResponseCode(taskId, responseCode);
  const msgId = await WechatMessage.findOne({ where: { taskId: taskId } });
  if (msgId?.eventType == "xft") {
    await xftMsg(eventKey);
  }
};

const xftMsg = async (key) => {
  const result = await xftOAApiClient.operate(JSON.parse(key));
};
