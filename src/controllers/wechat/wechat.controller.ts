import { decrypt } from "@wecom/crypto";
import { Request, Response } from "express";
import convert from "xml-js";
import { logger } from "../../config/logger";
import { handleApprovalEvent } from "./approval.wechat.controller";
import { handleContactEvent } from "./contact.wechat.controller";
import { handleMessageEvent } from "./message.wechat.controller";

export async function wechatWebHookCheck(request: Request, response: Response) {
  const encodingAESKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";
  const payload = request.query.echostr as string;
  const { message, id } = decrypt(encodingAESKey, payload);

  // return loaded posts
  response.send(message);
}

export async function wechatWebHook(request: Request, response: Response) {
  const encodingAESKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";
  let payload = request.body;
  let { message, id } = decrypt(encodingAESKey, payload["xml"]["Encrypt"][0]);
  message = convert.xml2json(message, {
    compact: true,
    spaces: 0,
    textKey: "value",
    cdataKey: "value",
    commentKey: "value",
  });
  await handleWechatMessage(JSON.parse(message));
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
    3;
  } catch (e) {
    logger.error(e);
  }
};
