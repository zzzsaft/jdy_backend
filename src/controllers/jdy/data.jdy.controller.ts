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
import { 入职申请表 } from "./addPerson.controller";
import { 来宾预约单 } from "./visitor.controller";
import { 离职, 转正 } from "./updateUser.jdy.controller";
import { SendTripCheckin } from "../../schedule/sendTripCheckin";
import { businessTripCheckinServices } from "../../features/jdy/service/businessTripCheckinServices";
import { restOvertimeServices } from "../../features/jdy/service/restOvertimeServices";
import { updateExistInfo } from "../../services/dahuaServices";
import { customerServices } from "../../services/crm/customerService";
import { opportunityServices } from "../../services/crm/opportunityService";
import { productService } from "../../services/crm/productService";
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
  const controller = JdyControllers?.[appId]?.[entryId]?.[op];
  if (controller) {
    await controller(body.data);
  }
  await supplierGatherService.trigger(appId, entryId, op, body.data);
  await followService.dataCreate(appId, entryId, op, body.data);
  await contactService.trigger(appId, entryId, op, body.data);
  await quoteService.trigger(appId, entryId, op, body.data);
  await opportunityServices.trigger(appId, entryId, op, body.data);
};

const createCustomer = async (data) => {
  if (!["设备厂家", "最终用户"].includes(data["_widget_1740442384783"])) return;
  if (!data["account_name"]) return;
  await customerServices.updateJdy(data["_id"], data["account_name"]);
  await customerServices.upsertToDb(data);
};

const updateCustomer = async (data) => {
  if (!["设备厂家", "最终用户"].includes(data["_widget_1740442384783"])) return;
  if (!data["_widget_1740848672029"] && data["_widget_1740674945157"]) {
    await customerServices.updateJdy(data["_id"], data["account_name"]);
  }
  await customerServices.upsertToDb(data);
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
    "65dc463c9b200f9b5e3b5851": {
      data_create: businessTripCheckinServices.dataProcess,
      data_update: businessTripCheckinServices.dataUpdate,
    },
    "64ccdcf9a03b0f000875fcde": {
      data_create: restOvertimeServices.add,
      data_update: restOvertimeServices.add,
    },
  },
  "5cd2228a0be7121e839d41bc": {
    "5dc4d7036ba9010006388e1d": {
      data_create: 来宾预约单,
    },
  },
  "6191e49fc6c18500070f60ca": {
    "020100200000000000000001": {
      data_create: createCustomer,
      data_update: updateCustomer,
    },
    "60458a6440c90e0008c75561": {
      data_create: async (data) => await productService.saveToDb(data),
      data_update: async (data) => await productService.saveToDb(data),
    },
  },
};
