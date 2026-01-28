import { decrypt } from "@wecom/crypto";
import { Request, Response } from "express";
import { logger } from "../../../config/logger";
import { handleApprovalEvent } from "./approval.wechat.controller";
import { handleContactEvent } from "./contact.wechat.controller";
import { handleMessageEvent } from "./message.wechat.controller";
import { LogExpress } from "../../../entity/log/log_express";
import { LogLocation } from "../../../entity/log/log_location";
import path from "path";
import { Between, Like, MoreThan } from "typeorm";
import { locationService } from "../../../services/locationService";
import { getCorpConfig } from "../../../config/wechatCorps";
import { syncWechatData } from "../service/wechatSyncService";
import { decryptMsg } from "../util";

export async function wechatWebHookCheck(request: Request, response: Response) {
  const corpId =
    (request.query.corpid as string) ||
    (request.query.corp_id as string) ||
    (request.query.corpId as string);
  const encodingAESKey = getCorpConfig(corpId).encodingAESKey ?? "";
  const payload = request.query.echostr as string;
  if (!payload) {
    response.status(400).send("Bad Request");
    return;
  }
  const { message, id } = decrypt(encodingAESKey, payload);

  // return loaded posts
  response.send(message);

  syncWechatData({ corpId }).catch((error) =>
    logger.error("sync wechat data failed", error)
  );
}

export async function wechatWebHook(request: Request, response: Response) {
  const corpId =
    (request.query.corpid as string) ||
    (request.query.corp_id as string) ||
    (request.query.corpId as string);
  let message = decryptMsg(request.body, corpId);
  await handleWechatMessage(message, corpId);
  // return loaded posts
  response.send("");
}

export const handleWechatMessage = async (msg, corpId?: string) => {
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
    if (message["Event"]["value"] === "LOCATION") {
      await handleLocation(message);
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

export const handleLocation = async (msg: any) => {
  const latitude = msg["Latitude"]["value"];
  const longitude = msg["Longitude"]["value"];
  const user = msg["FromUserName"]["value"];
  const time = msg["CreateTime"]["value"];
  const date = new Date(time * 1000);
  await locationService.addLocation(user, date, latitude, longitude);
};

export const testLocations = async () => {
  const locations = await LogExpress.find({
    where: {
      path: "/wechat",
      content: Like("%LOCATION%"),
      created_at: Between(new Date("2024-11-01"), new Date("2024-11-09")),
    },
  });
  const list: any[] = [];
  for (const location of locations) {
    const json = JSON.parse(location.content);
    let message = json["xml"];
    if (message["Event"]["value"] === "LOCATION") {
      list.push(await handleLocation(message));
    }
  }
  await LogLocation.save(list);
  // return locations;
};
