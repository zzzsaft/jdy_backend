import { Request, Response } from "express";
import sm from "sm-crypto";
import { xftTodoCallback } from "./todo.xft.controller";

const key = truncateKeyTo128Bits(process.env.XFT_EVENT_SECRET ?? "");

export const xftEvent = async (request: Request, response: Response) => {
  const { eventId, eventRcdInf } = request.body;
  const content = Buffer.from(
    sm.sm4.decrypt(eventRcdInf, key, {
      padding: "pkcs#5",
      output: "array",
    })
  ).toString("utf-8");
  if (eventId === "XFT00011") {
    await xftTodoCallback(content);
  }
  const responseData = {
    rtnCod: 200,
    errMsg: "",
  };
  return response.status(200).send(responseData);
};

function truncateKeyTo128Bits(key) {
  // 将密钥转换为 Buffer
  const keyBuffer = Buffer.from(key, "hex");

  // 如果密钥长度大于128比特，则截断前128比特；如果长度小于128比特，则在末尾填充0
  const truncatedKeyBuffer =
    keyBuffer.length >= 16
      ? keyBuffer.slice(0, 16)
      : Buffer.concat([keyBuffer, Buffer.alloc(16 - keyBuffer.length)]);

  // 将截断或填充后的 Buffer 转换为十六进制字符串
  return truncatedKeyBuffer.toString("hex");
}
