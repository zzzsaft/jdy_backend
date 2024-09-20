import { Request, Response } from "express";
import * as crypto from "crypto";
import dotenv from "dotenv";
import { 智能助手 } from "./dataTrigger.controller";
import {
  addCar,
  deleteCar,
  punishCar,
  updateCar,
} from "./parking.jdy.contollers";
import exp from "constants";
import { updateExistInfo, 入职申请表 } from "./addPerson.controller";
import { 来宾预约单 } from "./visitor.controller";
import { 离职, 转正 } from "./updateUser.jdy.controller";

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
    response.status(401).send("fail");
  }
  response.send("success");
  // new 智能助手(request.body);
  await controllerMethod(request.body);
};

const controllerMethod = async (body) => {
  const entryId = body.data.entryId;
  const appId = body.data.appId;
  const op = body.op;
  const controller = JdyControllers?.[appId]?.[entryId]?.[op];
  if (controller) {
    await controller(body.data);
  }
};

const JdyControllers = {
  "5cd65fc5272c106bbc2bbc38": {
    "668cf9e8bb998350eae3bae6": {
      data_create: addCar,
      data_update: updateCar,
      data_remove: deleteCar,
    },
    "668d244cbae980236ab4e62c": {
      data_update: punishCar,
    },
  },
  "5cfef4b5de0b2278b05c8380": {
    "5cfef54d0fc84505a1d270f4": {
      data_create: 入职申请表,
    },
    "5c862c6e2444081a3681f651": {
      data_update: 转正,
    },
    "6580fbeabeab377a1508c1a1": {
      data_update: 离职,
    },
    "6414573264b9920007c82491": {
      data_update: updateExistInfo,
    },
  },
  "5cd2228a0be7121e839d41bc": {
    "5dc4d7036ba9010006388e1d": {
      data_create: 来宾预约单,
    },
  },
};
