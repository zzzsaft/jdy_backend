import { Request, Response } from "express";
import { Jdy_Users } from "../../entity/log/jdy_users";
import { wechatUserApiClient } from "../../api/wechat/user";

export const jdyRedirect = async (request: Request, response: Response) => {
  const code = request.query.code;
  const url = request.query.url as string;
  const non_jdy_user_url = (
    BigInt(`0x${(url ?? "").split("/").pop() ?? ""}`) + BigInt(1)
  ).toString(16);

  if (typeof code !== "string") {
    return "no code";
  }
  const userid = await wechatUserApiClient.getUserInfo(code);
  //   const userid = code;
  const users = await Jdy_Users.findOne({
    where: { userid: userid["userid"] },
  });
  if (users && users.isActive) {
    response.redirect(url);
  } else {
    response.redirect(
      `https://tmxvicaxx2.jiandaoyun.com/f/${non_jdy_user_url}?ext=1`
    );
  }
};
