import { Request, Response } from "express";
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
