import crypto from "crypto";
import { Request, Response } from "express";
import nodeRSA from "node-rsa";
import { wechatUserApiClient } from "../../utils/wechat/user";
import qs from "querystring";
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
const key = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);

// 导出公钥
const publicKey = key.exportKey("public");

export const xftSSOLogin = async (request: Request, response: Response) => {
  const 连接器ID = "223147993689554944";
  const 连接流ID = "224943279282388992";
  const XFT_HOST = `https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/${连接器ID}_${连接流ID}`;
  const code = request.query.code;
  const toDoID = request.query.todoid;
  if (typeof code !== "string") {
    return "no code";
  }
  const userid = (await wechatUserApiClient.getUserInfo(code))["userid"];
  // const userid = "LiangZhi";
  const userInfo = {
    userid: userid,
    timestamp: Date.now(),
  };
  const secret = encrypt(Buffer.from(JSON.stringify(userInfo)));

  let redirectUrl = `${XFT_HOST}?pageId=workbench&secret=${secret}`;

  const extPam = { toDoType: "0", toDoId: toDoID };
  if (toDoID) {
    redirectUrl = `${XFT_HOST}?extTyp=todo&extPam=${qs.escape(
      JSON.stringify(extPam)
    )}&secret=${secret}`;
  }
  console.log(redirectUrl);
  response.redirect(redirectUrl);
};

function encrypt(plaintext: Buffer): string {
  return crypto
    .publicEncrypt(
      {
        key: Buffer.from(publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      plaintext
    )
    .toString("base64");
}
