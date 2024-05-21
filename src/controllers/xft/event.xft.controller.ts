import { Request, Response } from "express";
import sm from "sm-crypto";
import { xftTodoCallback } from "./todo.xft.controller";

const key = process.env.XFT_EVENT_SECRET ?? "";

export const xftEvent = async (request: Request, response: Response) => {
  const { eventId, eventRcdInf } = request.body;
  const content = Buffer.from(
    sm.sm4.decrypt(eventRcdInf, key, {
      padding: "pkcs#5",
      output: "array",
    })
  ).toString("utf-8");
  if (eventId === "XFT00011") {
    xftTodoCallback(content);
  }
  const responseData = {
    rtnCod: 200,
    errMsg: "",
  };
  return response.status(200).send(responseData);
};
