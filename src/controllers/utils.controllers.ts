import { Request, Response } from "express";
import fs from "fs";
import { getLocalFilePath } from "../utils/fileUtils";
export const isLicensePlate = async (request: Request, response: Response) => {
  const license = request.params.license_plate.toUpperCase();
  const regex =
    /^(([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z](([0-9]{5}[A-K])|([A-K]([A-HJ-NP-Z0-9])[0-9]{4})))|([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9挂学警港澳使领]))$/;
  if (request.params.license_plate) {
    response.send({
      value: regex.test(license).toString(),
      color: license.length === 8 ? "绿色" : "蓝色",
    });
  } else response.send({ value: "false" });
};

export const sendImage = async (request: Request, response: Response) => {
  const id = request.params.id;
  const path = request.params.path;
  const imagePath = getLocalFilePath(`./public/images/${path}/${id}.jpg`);
  fs.readFile(imagePath, (err, data) => {
    if (err) {
      return response.status(500).send("Error reading the image file.");
    }
    response.writeHead(200, {
      "Content-Type": "image/jpg", // 根据图片类型调整 Content-Type
      "Content-Length": data.length,
    });
    response.end(data);
  });
};

export const sendAddress = async (request: Request, response: Response) => {};
