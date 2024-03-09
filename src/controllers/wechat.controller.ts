import { decrypt } from "@wecom/crypto";
import { Request, Response } from "express";

export async function wechatWebHook(request: Request, response: Response) {
  const encodingAESKey = process.env.WECHAT_ENCODING_AES_KEY;
  const payload = request.body;
  // const msg_signature = request.args["msg_signature"];
  // const nonce = request.args["nonce"];
  // const timestamp = request.args["timestamp"];
  const { message, id } = decrypt(encodingAESKey, payload);
  console.log(message, id);

  // return loaded posts
  // response.send(triggers);
}
