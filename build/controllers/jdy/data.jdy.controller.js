import * as crypto from "crypto";
import dotenv from "dotenv";
import { 智能助手 } from "./dataTrigger.controller";
function getSignature(nonce, payload, secret, timestamp) {
    const content = [nonce, payload, secret, timestamp].join(":");
    const hash = crypto.createHash("sha1");
    hash.update(content);
    return hash.digest("hex");
}
export const JdyWebhook = (request, response) => {
    dotenv.config();
    const webhook_token = process.env.JDY_WEBHOOK_TOKEN;
    const payload = JSON.stringify(request.body);
    const nonce = request.query.nonce;
    const timestamp = request.query.timestamp;
    const signature = request.headers["x-jdy-signature"];
    if (signature !== getSignature(nonce, payload, webhook_token, timestamp)) {
        return response.status(401).send("fail");
    }
    new 智能助手(request.body);
    return response.send("success");
};
//# sourceMappingURL=data.jdy.controller.js.map