import * as crypto from "crypto";
import { Request, Response } from "express";
import { getHandlers } from "./jdy.registry";
import { opportunityServices } from "../../services/crm/opportunityService";
import { supplierGatherService } from "../../services/srm/supplierGatherService";
import { followService } from "../../services/crm/followService";
import { contactService } from "../../services/crm/contactService";
import { quoteService } from "../../services/crm/quoteService";

function getSignature(
  nonce: string,
  payload: string,
  secret: string,
  timestamp: string
): string {
  const content = [nonce, payload, secret, timestamp].join(":");
  const hash = crypto.createHash("sha1");
  hash.update(content);
  return hash.digest("hex");
}

export const JdyWebhook = async (request: Request, response: Response) => {
  const webhook_token = process.env.JDY_WEBHOOK_TOKEN ?? "test";
  const payload = JSON.stringify(request.body);
  const nonce = request.query.nonce as string;
  const timestamp = request.query.timestamp as string;
  const signature = request.headers["x-jdy-signature"] as string;
  if (signature !== getSignature(nonce, payload, webhook_token, timestamp)) {
    // console.log(webhook_token, "不正确", payload);
    // response.status(401).send("fail");
    // return;
  }
  response.send("success");
  // new 智能助手(request.body);
  await controllerMethod(request.body);
};

export const controllerMethod = async (body) => {
  const entryId = body.data.entryId;
  const appId = body.data.appId;
  const op = body.op;

  const handlers = getHandlers(appId, entryId, op);
  for (const handler of handlers) {
    await handler(body.data);
  }

  await supplierGatherService.trigger(appId, entryId, op, body.data);
  await followService.dataCreate(appId, entryId, op, body.data);
  await contactService.trigger(appId, entryId, op, body.data);
  await quoteService.trigger(appId, entryId, op, body.data);
  await opportunityServices.trigger(appId, entryId, op, body.data);
};
