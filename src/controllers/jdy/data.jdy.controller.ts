import { Request, Response } from "express";
import * as crypto from "crypto";
import dotenv from "dotenv";
import { 智能助手 } from "./dataTrigger.controller";
import { addCar, deleteCar, updateCar } from "./parking.jdy.contollers";
import exp from "constants";

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
  const webhook_token = process.env.JDY_WEBHOOK_TOKEN ?? "";
  const payload = JSON.stringify(request.body);
  const nonce = request.query.nonce as string;
  const timestamp = request.query.timestamp as string;
  const signature = request.headers["x-jdy-signature"] as string;
  if (signature !== getSignature(nonce, payload, webhook_token, timestamp)) {
    return response.status(401).send("fail");
  }
  // new 智能助手(request.body);
  const entryId = request.body.data.entryId;
  const appId = request.body.data.appId;
  const op = request.body.op;
  const controller = JdyControllers?.[appId]?.[entryId]?.[op];
  if (controller) {
    controller(request.body.data);
  }
  return response.send("success");
};

const JdyControllers = {
  "5cd65fc5272c106bbc2bbc38": {
    "668cf9e8bb998350eae3bae6": {
      data_create: addCar,
      data_update: updateCar,
      data_remove: deleteCar,
    },
    "668d244cbae980236ab4e62c": {
      data_update: updateCar,
    },
  },
};
