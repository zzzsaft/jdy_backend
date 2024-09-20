import { Request, Response } from "express";
import { xftTaskCallback } from "./todo.xft.controller";
import { decryptXftEvent } from "../../utils/xft/decrypt";

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
};
