import crypto from "crypto";
import { Request, Response } from "express";
import nodeRSA from "node-rsa";
import { wechatUserApiClient } from "../../utils/wechat/user";
import qs from "querystring";
import { MessageHelper } from "../../utils/wechat/message";

export const xftTodo = async (request: Request, response: Response) => {
  const { userinfo, userid, todoDetail } = request.body;
  await xftTodoCallback(userinfo, userid, todoDetail);

  return response.send("success");
};

export const xftTodoCallback = async (userinfo, userid, todoDetail) => {
  const redirectUrl = `http://hz.jc-times.com:2000/xft/sso?todoid=${todoDetail.id}`;
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?
  appid=wwd56c5091f4258911&redirect_uri=${qs.escape(redirectUrl)}&
  response_type=code&scope=snsapi_base&state=STATE&agentid=1000061#wechat_redirect`;

  await new MessageHelper([userid]).send_text_card(
    todoDetail.title,
    todoDetail,
    url
  );
  await new MessageHelper(["LiangZhi"]).send_plain_text(todoDetail);
};
