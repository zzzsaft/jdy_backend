import { Request, Response } from "express";
import { xftTaskCallback } from "./todo.xft.controller";
import { decryptXftEvent } from "../../api/xft/decrypt";
import { xftSalaryApiClient } from "../../api/xft/xft_salary";
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
  if (eventId === "XFTSTFUPT") {
    await XFTSTFUPT(content);
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
  await XFTSTFUPT(content);
};
const XFTSTFUPT = async (content) => {
  const parsed = JSON.parse(content);
  const userid = parsed["STFNBR"];
  const user = await User.findOne({
    where: { user_id: userid },
  });
  if (!user) return;
  user.bank = parsed?.["BNKTYP"];
  user.bankAccount = parsed?.["SALCAR"];
  await user.save();
};
