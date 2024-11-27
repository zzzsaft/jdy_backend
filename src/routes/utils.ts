import { isLicensePlate, sendImage } from "../controllers/utils.controllers";
import { Request, Response } from "express";
import { quotaServices } from "../services/xft/quotaServices";
import { checkinServices } from "../services/xft/checkinServices";
import {
  createShiftExcel,
  restOvertimeServices,
} from "../services/jdy/restOvertimeServices";
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
const createShift = async (request: Request, response: Response) => {
  const date = request.params.dateString as string;
  const result = await restOvertimeServices.getShiftExcel(date);
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(result.name)}"`
  );
  response.setHeader("Content-Type", "application/octet-stream");
  result.file.pipe(response);
  result.file.on("error", (err) => {
    console.error("文件流错误:", err);
    response.status(500).send("文件下载失败");
  });
  result.file.on("end", () => {});
};
const sendSalaryList = async (request: Request, response: Response) => {
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
  {
    path: "/shift_excel/:dateString",
    method: "get",
    action: createShift,
  },
  {
    path: "/send_salary",
    method: "get",
    action: createShift,
  },
];
