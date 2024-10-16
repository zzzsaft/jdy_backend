import crypto from "crypto";
import { Request, Response } from "express";
import nodeRSA from "node-rsa";
import { wechatUserApiClient } from "../../api/wechat/user";
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
  const pageId = request.query.pageId;
  if (typeof code !== "string") {
    return "no code";
  }
  const userid = (await wechatUserApiClient.getUserInfo(code))["userid"].slice(
    0,
    20
  );
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
  if (pageId) {
    redirectUrl = `${XFT_HOST}?pageId=${pageId}&ecret=${secret}`;
  }
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

export const testXftSSOLogin = async (request: Request, response: Response) => {
  const 连接器ID = "223147993689554944";
  const 连接流ID = "224943279282388992";
  const XFT_HOST = `https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/${连接器ID}_${连接流ID}`;
  const userInfo = {
    userid: "ceshi",
    timestamp: Date.now(),
  };
  const secret = encrypt(Buffer.from(JSON.stringify(userInfo)));
  response.redirect(`${XFT_HOST}?pageId=workbench&secret=${secret}`);
};

export const testLoginUrl = (userid, todoId: any = null) => {
  const 连接器ID = "223147993689554944";
  const 连接流ID = "224943279282388992";
  const XFT_HOST = `https://xft.cmbchina.com/xft-gateway/xft-login-new/xwapi/login/${连接器ID}_${连接流ID}`;
  const userInfo = {
    userid: userid,
    timestamp: Date.now(),
  };
  const secret = encrypt(Buffer.from(JSON.stringify(userInfo)));
  const extPam = { toDoType: "0", toDoId: todoId };
  if (todoId) {
    return `${XFT_HOST}?extTyp=todo&extPam=${qs.escape(
      JSON.stringify(extPam)
    )}&secret=${secret}`;
  }
  const url = `${XFT_HOST}?pageId=workbench&secret=${secret}`;
  console.log(url);
  return url;
};
