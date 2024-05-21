import crypto from "crypto";
import { Request, Response } from "express";
import nodeRSA from "node-rsa";
import { wechatUserApiClient } from "../../utils/wechat/user";
import qs from "querystring";
import { MessageHelper } from "../../utils/wechat/message";
import { User } from "../../entity/wechat/User";

export const xftTodo = async (request: Request, response: Response) => {
  const { userinfo, userid, todoDetail } = request.body;
  await xftTodoCallback(userinfo);

  return response.send("success");
};

export const xftTodoCallback = async (content) => {
  const { id, details, businessName, receiver } = JSON.parse(content);
  const redirectUrl = `http://hz.jc-times.com:2000/xft/sso?todoid=${id}`;
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=wwd56c5091f4258911&redirect_uri=${qs.escape(
    redirectUrl
  )}&response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;
  const userid = await User.getUser_id(receiver["xftUserId"]);
  await new MessageHelper([userid]).send_text_card(businessName, details, url);
};
