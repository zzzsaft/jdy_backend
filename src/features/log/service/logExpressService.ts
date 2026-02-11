import { IsNull } from "typeorm";
import { LogExpress } from "../entity/log_express";
import { decryptXftEvent } from "../../xft/api/decrypt";
import { decryptMsg } from "../../wechat/util";

export async function addToLog(
  ip,
  method,
  query: string,
  path: string,
  msg,
) {
  if (!ip || !method) return;
  if (
    path.includes("sso") ||
    path == "/" ||
    path.includes("customer") ||
    path.includes("auth") ||
    path.includes("category") ||
    path.includes("quote")
  )
    return;
  let content = "";
  if (path === "/xft/event") {
    const { eventId, eventRcdInf } = JSON.parse(msg);
    content = decryptXftEvent(eventRcdInf);
  } else if (path === "/wechat") {
    content = decryptMsg(JSON.parse(msg));
    if (
      content["xml"]?.["Event"]?.["value"] === "view" ||
      content["xml"]?.["Event"]?.["value"] === "LOCATION"
    ) {
      return;
    }
  }
  const log = LogExpress.create({
    ip,
    method,
    query: JSON.stringify(query).slice(0, 200),
    path,
    msg,
    content,
  });
  await LogExpress.save(log);
}

export async function updateXftEventLog() {
  const logs = await LogExpress.find({
    where: { path: "/xft/event", content: IsNull() },
  });
  for (const log of logs) {
    const { eventRcdInf } = JSON.parse(log.msg);
    const content = decryptXftEvent(eventRcdInf);
    log.content = content;
  }
  await LogExpress.save(logs);
}

export async function updateWechatEventLog() {
  const logs = await LogExpress.find({
    where: { path: "/wechat", content: IsNull() },
    take: 2000,
  });
  for (const log of logs) {
    log.content = decryptMsg(JSON.parse(log.msg));
  }
  await LogExpress.save(logs);
}
