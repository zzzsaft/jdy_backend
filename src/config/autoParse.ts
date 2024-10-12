import bodyParser from "body-parser";
import xmlparser from "body-parser-xml";
import { LogExpress } from "../entity/log/log_express";
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
    bodyParser.json()(req, res, next);
  }
};

export const expressLog = async (req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  await LogExpress.addToLog(
    clientIp,
    req.method,
    req.query,
    req.path,
    JSON.stringify(req.body)
  );
  next();
};

export const requestLimiter = rateLimit({
  windowMs: 1000, // 时间窗口为 1 秒
  max: 1, // 每个IP+请求体在 1 秒内最多允许 1 次请求
  keyGenerator: (req: Request) => {
    // 基于 IP 和请求体生成唯一键
    return `${req.ip}-${JSON.stringify(req.body)}`;
  },
  handler: (req: Request, res: Response) => {
    res
      .status(200)
      .json({ message: "Too many requests, please try again later." });
  },
});
