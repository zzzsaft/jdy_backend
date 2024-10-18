import { isLicensePlate, sendImage } from "../controllers/utils.controllers";
import { Request, Response } from "express";
const test = async (request: Request, response: Response) => {
  console.log("Test");
  response.send("Hello World!");
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
];
