import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import axios from "axios";
import { wechatUserApiClient } from "../../features/wechat/api/user";
// JWT验证与响应生成
async function verifyAndCreateResponse(userid, redirect_uri?: string) {
  const secret = process.env.JDYSSO_SECRET || "";
  // // 验证请求令牌
  // const decoded = jwt.verify(requestToken, secret, {
  //   algorithms: ['HS256', 'HS384', 'HS512'], // 允许的加密算法
  //   issuer: 'com.jiandaoyun', // 预期颁发者
  //   clockTolerance: 3600 // 允许1小时时钟偏差
  // });

  // // 检查令牌类型
  // if (decoded?.['type'] !== 'sso_req') {
  //   throw new Error('令牌类型无效 - 应为sso_req');
  // }
  // 创建响应令牌
  return jwt.sign(
    {
      type: "sso_res",
      username: userid,
      redirect_uri,
    },
    secret,
    {
      algorithm: "HS256", // 使用HS256算法
      expiresIn: 60000, // 1分钟后过期
      audience: "com.jiandaoyun", // 目标受众
    }
  );
}

export async function jdySsoRequest(request: Request, response: Response) {
  const { code, url, useridt } = request.query;
  const acs = process.env.JDYSSO_ACS;
  if (typeof code !== "string") {
    return "no code";
  }
  const userid = (await wechatUserApiClient.getUserInfo(code))["userid"];
  try {
    // 验证并创建响应
    const responseToken = await verifyAndCreateResponse(userid, url as string);

    // 构造重定向URL
    const responseQuery = new URLSearchParams({
      response: responseToken,
      // state
    }).toString();
    return response.redirect(`${acs}?${responseQuery}`);
  } catch (error) {
    console.error("SSO错误:", error);
    return response.status(400).send("请求无效");
  }
}
