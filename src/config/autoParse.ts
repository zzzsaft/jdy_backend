import bodyParser from "body-parser";
import xmlparser from "body-parser-xml";
import { addToLog } from "../features/log/service/logExpressService.js";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
// 自定义中间件来根据请求主体的Content-Type自动选择解析器
export const autoParse = (req, res, next) => {
  //   console.log("Request is ", req.get("Content-Type"), req.is("xml"), req);
  if (req.is("text/xml")) {
    // 如果是XML格式，使用XML解析器
    xmlparser(bodyParser);
    bodyParser.xml()(req, res, next);
  } else {
    bodyParser.json({
      verify: (req: any, _res, buf) => {
        // Keep raw body so we can re-parse JSON safely for 19-digit IDs (avoid JS number rounding).
        req.rawBody = buf?.toString("utf8");
      },
    })(req, res, next);
  }
};

export const expressLog = async (req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  // Prefer rawBody to avoid JS number rounding (e.g. 19-digit BestSign IDs).
  const bodyText =
    typeof (req as any).rawBody === "string" && (req as any).rawBody.length
      ? (req as any).rawBody
      : JSON.stringify(req.body);
  await addToLog(
    clientIp,
    req.method,
    req.query,
    req.path,
    bodyText
  );
  next();
};

export const requestLimiter = rateLimit({
  windowMs: 1, // 时间窗口为 1 秒
  max: 1, // 每个IP+请求体在 1 秒内最多允许 1 次请求
  keyGenerator: (req: Request) => {
    // 基于 IP 和请求体生成唯一键
    return `${req.ip}-${JSON.stringify(req.body)}-${req.originalUrl}`;
  },
  handler: (req: Request, res: Response) => {
    // console.log("Too many requests, please try again later.");
    res
      .status(400)
      .json({ message: "Too many requests, please try again later." });
  },
});
