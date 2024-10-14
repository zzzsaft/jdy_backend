import { decrypt } from "@wecom/crypto";
import { Request, Response } from "express";
import { logger } from "../../config/logger";
import { handleApprovalEvent } from "./approval.wechat.controller";
import { handleContactEvent } from "./contact.wechat.controller";
import { handleMessageEvent } from "./message.wechat.controller";
import { LogExpress } from "../../entity/log/log_express";
import { decryptMsg } from "../../api/wechat/decrypt";

export async function wechatWebHookCheck(request: Request, response: Response) {
  const encodingAESKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";
  const payload = request.query.echostr as string;
  const { message, id } = decrypt(encodingAESKey, payload);

  // return loaded posts
  response.send(message);
}

export async function wechatWebHook(request: Request, response: Response) {
  let message = decryptMsg(request.body);
  await handleWechatMessage(message);
  // return loaded posts
  response.send("");
}

const handleWechatMessage = async (msg) => {
  let message = msg["xml"];
  let ApprovalInfo = message["ApprovalInfo"];
  try {
    if (message["Event"]["value"] === "sys_approval_change") {
      await handleApprovalEvent(
        ApprovalInfo["SpNo"]["value"],
        ApprovalInfo["SpStatus"]["value"]
      );
    }
    if (message["Event"]["value"] === "change_contact") {
      await handleContactEvent(message);
    }
    if (message["Event"]["value"] === "template_card_event") {
      await handleMessageEvent(message);
    }
  } catch (e) {
    logger.error(e);
  }
};

export const testWechatWebhook = async () => {
  const logs = await LogExpress.find({
    where: { path: "/wechat", method: "post" },
  });
  for (const log of logs) {
    const json = JSON.parse(log.msg);
    const msg = decryptMsg(json);
    let message = msg["xml"];
    if (message["Event"]["value"] === "change_contact") {
      console.log(message);
    }
  }
  return logs;
};
