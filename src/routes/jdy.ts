import { JdyWebhook } from "../controllers/jdy/data.jdy.controller";
import { Request, Response } from "express";
import { 制品表面处理要求 } from "../controllers/jdy/制品表面处理要求";

export const JdyDataRoutes = [
  {
    path: "/jdy/data",
    method: "post",
    action: JdyWebhook,
  },
  {
    path: "/sale/product_detail",
    method: "post",
    action: 制品表面处理要求,
  },
  // {
  //   path: "/jdy/getAllTriggers",
  //   method: "get",
  //   //   action: GetAllTriggerInfos,
  // },
];
