import { Request, Response } from "express";
import qs from "querystring";
import { buttonCardType, MessageHelper } from "../../utils/wechat/message";
import { User } from "../../entity/wechat/User";
import { WechatMessage } from "../../entity/wechat/message";
import { logger } from "../../config/logger";
import { v4 as uuidv4 } from "uuid";

export const xftTodo = async (request: Request, response: Response) => {
  const { userinfo, userid, todoDetail } = request.body;
  await xftTodoCallback(userinfo);

  return response.send("success");
};

export const xftTodoCallback = async (content) => {
  let {
    id,
    details,
    businessName,
    appName,
    receiver,
    dealStatus,
    processStatus,
    title,
    businessParam,
    processId,
  } = JSON.parse(content);
  const redirectUrl = `http://hz.jc-times.com:2000/xft/sso?todoid=${id}`;
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
    redirectUrl
  )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
  const userid = await User.getUser_id(receiver["xftUserId"]);
  const status =
    dealStatus == "2"
      ? "已撤销"
      : {
          0: "审批中",
          1: "已通过",
          2: "已否决",
          3: "已退回",
          4: "撤销",
          5: "撤回",
        }?.[processStatus] ?? "已处理";
  const msgId = await WechatMessage.getMsgId(id, "xft");
  title = title ?? businessName;
  if (msgId && dealStatus != "0") {
    await new MessageHelper([userid]).disableButton(msgId.responseCode, status);
  } else {
    const approve = {
      approverId: receiver["xftUserId"],
      operateType: "pass",
      busKey: businessParam,
      taskId: processId,
    };
    const reject = {
      approverId: receiver["xftUserId"],
      operateType: "reject",
      busKey: businessParam,
      taskId: processId,
    };
    const config: buttonCardType = {
      event: { eventId: id, eventType: "xft" as "xft" },
      sub_title_text: details,
      button_list: [
        { text: "驳回", type: 0, style: 3, key: JSON.stringify(reject) },
        { text: "同意", type: 0, style: 1, key: JSON.stringify(approve) },
      ],
      main_title: { title: title, desc: appName },
      card_action: { type: 1, url },
    };
    if ("数据采集" in title) {
      config["button_list"] = [
        {
          text: "点击处理",
          type: 1,
          style: 1,
          url: url,
        },
      ];
    }
    await new MessageHelper([userid]).sendButtonCard(config);
  }
};
