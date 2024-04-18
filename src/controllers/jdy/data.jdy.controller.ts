import { Request, Response } from "express";
import * as crypto from "crypto";
import dotenv from "dotenv";
import { 智能助手 } from "./dataTrigger.controller";

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

export const JdyWebhook = (request: Request, response: Response) => {
  // dotenv.config();
  const webhook_token = process.env.JDY_WEBHOOK_TOKEN ?? "";
  const payload = JSON.stringify(request.body);
  const nonce = request.query.nonce as string;
  const timestamp = request.query.timestamp as string;
  const signature = request.headers["x-jdy-signature"] as string;
  if (signature !== getSignature(nonce, payload, webhook_token, timestamp)) {
    return response.status(401).send("fail");
  }
  new 智能助手(request.body);
  return response.send("success");
};
