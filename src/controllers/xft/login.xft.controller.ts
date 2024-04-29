import crypto from "crypto";
import { Request, Response } from "express";
import nodeRSA from "node-rsa";
import { wechatUserApiClient } from "../../utils/wechat/user";

const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
const key = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);

// 导出公钥
const publicKey = key.exportKey("public");

export const xftSSOLogin = async (request: Request, response: Response) => {
  const XFT_HOST = `https://xft.cmbchina.com/`;
  const 连接器ID = "223147993689554944";
  const 连接流ID = "224943279282388992";
  const code = request.query.code;
  if (typeof code !== "string") {
    return "no code";
  }
  const userid = wechatUserApiClient.getUserInfo(code)["userid"];
  const userInfo = {
    userid: userid,
    timestamp: Date.now(),
  };

  const secret = encrypt(Buffer.from(JSON.stringify(userInfo)));
  const redirectUrl = `${XFT_HOST}/xft-gateway/xft-login-new/xwapi/login/${连接器ID}_${连接流ID}?pageId=workbench&secret=${secret}`;
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
