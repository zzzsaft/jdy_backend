import { isLicensePlate, sendImage } from "../controllers/utils.controllers";
import { Request, Response } from "express";
import { quotaServices } from "../services/xft/quotaServices";
const test = async (request: Request, response: Response) => {
  console.log("Test");
  response.send("Hello World!");
};
const getQuota = async (request: Request, response: Response) => {
  const userid = request.params.userid;

  response.send(await quotaServices.getSingleDayOffQuotaLeftByUserId(userid));
};
export const UtilsRoutes = [
  {
    path: "/utils/plate/:license_plate",
    method: "get",
    action: isLicensePlate,
  },
  {
    path: "/images/:path/:id",
    method: "get",
    action: sendImage,
  },
  {
    path: "/address",
    method: "get",
    action: sendImage,
  },
  {
    path: "/test",
    method: "get",
    action: test,
  },
  {
    path: "/getQuota",
    method: "get",
    action: getQuota,
  },
];
