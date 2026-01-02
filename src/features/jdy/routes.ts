import { JdyWebhook } from "../../controllers/jdy/data.jdy.controller";
import { Request, Response } from "express";
import { 制品表面处理要求 } from "../../controllers/jdy/制品表面处理要求";
import { searchServices } from "../../services/crm/searchService";

const childList = async (request: Request, response: Response) => {
  const data = request.query.data as string;
  const result = data.split(",").map((item) => {
    return {
      item: item,
    };
  });
  return response.send({ result });
};

const companySearch = async (request: Request, response: Response) => {
  const authHeader = request.headers["authorization"];
  // if (authHeader !== "Bearer 123456") {
  //   return response.status(401).send({ error: "Unauthorized" });
  // }
  const key = request.query.key as string;
  await searchServices.searchCompany(key);
  return response.send({ result: "success" });
};

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
  {
    path: "/jdy/sale/jsonPath",
    method: "get",
    action: childList,
  },
  {
    path: "/jdy/sale/companySearch",
    method: "get",
    action: companySearch,
  },
  // {
  //   path: "/jdy/getAllTriggers",
  //   method: "get",
  //   //   action: GetAllTriggerInfos,
  // },
];
