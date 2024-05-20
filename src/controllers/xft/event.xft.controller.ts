import { Request, Response } from "express";
import pkg from "sm-crypto";
const { sm2, sm3 } = pkg;

const key = process.env.XFT_EVENT_SECRET ?? "";

export const xftEvent = async (request: Request, response: Response) => {
  const body = request.body;
  console.log(body);
  const signature = sm2.doDecrypt(body["eventRcdInf"], key);
  console.log(signature);
  const responseData = {
    rtnCod: 200,
    errMsg: "",
  };
  return response.status(200).send(responseData);
};
