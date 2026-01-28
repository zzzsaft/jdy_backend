import { decrypt } from "@wecom/crypto";
import convert from "xml-js";
import { getCorpConfig } from "../../config/wechatCorps";

export const decryptMsg = (payload, corpId?: string) => {
  if (!payload || !payload?.["xml"]) return "";
  const encodingAESKey = getCorpConfig(corpId).encodingAESKey ?? "";
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
