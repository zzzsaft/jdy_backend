import { Request, Response } from "express";
import { xftTaskCallback } from "./todo.xft.controller";
import { decryptXftEvent } from "../../utils/xft/decrypt";
import { xftSalaryApiClient } from "../../utils/xft/xft_salary";
import { SalaryRecord } from "../../entity/basic/salary-record";
import { User } from "../../entity/basic/employee";

export const xftEvent = async (request: Request, response: Response) => {
  const { eventId, eventRcdInf } = request.body;
  const content = decryptXftEvent(eventRcdInf);
  const responseData = {
    rtnCod: 200,
    errMsg: "",
  };
  response.status(200).send(responseData);
  if (eventId === "XFT00011") {
    await xftTaskCallback(content);
  }
  if (eventId === "XFTSTFADD") {
    await XFTSTFADD(content);
  }
};
const XFTSTFADD = async (content) => {
  const parsed = JSON.parse(content);
  const salary = await SalaryRecord.getRecord(parsed["STFNBR"]);
  await xftSalaryApiClient.setSalary(
    parsed["STFNAM"],
    parsed["STFNBR"],
    salary?.probation
  );
};
