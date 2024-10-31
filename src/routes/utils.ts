import { isLicensePlate, sendImage } from "../controllers/utils.controllers";
import { Request, Response } from "express";
import { quotaServices } from "../services/xft/quotaServices";
import { checkinServices } from "../services/xft/checkinServices";
const test = async (request: Request, response: Response) => {
  console.log("Test");
  response.send("Hello World!");
};
const getQuota = async (request: Request, response: Response) => {
  const userid = request.query.userid as string;
  response.send(await quotaServices.getSingleDayOffQuotaLeftByUserId(userid));
};

const updateCheckin = async (request: Request, response: Response) => {
  const date = request.query.dateNumber as string;
  const result = await checkinServices.scheduleCheckinDaily(parseInt(date));
  response.send(date);
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
  {
    path: "/updateCheckin",
    method: "get",
    action: updateCheckin,
  },
];
