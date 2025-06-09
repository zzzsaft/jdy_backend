import { decrypt } from "@wecom/crypto";
import convert from "xml-js";

export const decryptMsg = (payload) => {
  if (!payload || !payload?.["xml"]) return "";
  const encodingAESKey = process.env.WECHAT_ENCODING_AES_KEY ?? "";
  let { message, id } = decrypt(
    encodingAESKey,
    payload?.["xml"]?.["Encrypt"]?.[0]
  );
  return JSON.parse(
    convert.xml2json(message, {
      compact: true,
      spaces: 0,
      textKey: "value",
      cdataKey: "value",
      commentKey: "value",
    })
  );
};
