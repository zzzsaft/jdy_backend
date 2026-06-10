import { isLicensePlate, sendImage } from "../controllers/utils.controllers.js";
import { Request, Response } from "express";
import { isValid, parse } from "date-fns";
import { quotaServices } from "../features/xft/service/quotaServices.js";
import { checkinServices } from "../features/xft/service/checkinServices.js";
import {
  createShiftExcel,
  restOvertimeServices,
} from "../features/jdy/service/restOvertimeServices.js";
import { atdClassService } from "../features/xft/service/atdClass.services.js";
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
const getWorkStartTime = async (request: Request, response: Response) => {
  const userid = request.query.userid as string;
  const date = request.query.date as string;
  if (!userid || !date) return response.status(400).send("参数错误");
  const workDate = parseQueryDate(date);
  if (!workDate) return response.status(400).send("日期格式错误");
  const time = await atdClassService.getWorkStartTime(userid, workDate);
  response.send({ start: time });
};

const parseQueryDate = (value: string) => {
  const dateText = String(value ?? "").trim();
  if (!dateText) return null;
  const date = /^\d{8}$/.test(dateText)
    ? parse(dateText, "yyyyMMdd", new Date())
    : new Date(dateText);
  return isValid(date) ? date : null;
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
  {
    path: "/getWorkStartTime",
    method: "get",
    action: getWorkStartTime,
  },
];
