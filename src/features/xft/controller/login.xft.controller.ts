import { Request, Response } from "express";
import { logger } from "../../../config/logger.js";
import { wechatUserApiClient } from "../../wechat/api/user.js";
import { xftSSOApiClient } from "../api/xft_sso.js";

export const xftSSOLogin = async (request: Request, response: Response) => {
  const code = request.query.code;
  const toDoID = request.query.todoid;
  const pageId = request.query.pageId;
  if (typeof code !== "string" || !code.trim()) {
    logger.warn("[xft-sso] rejected callback without OAuth code");
    return response.status(400).send("Missing WeCom OAuth code");
  }
  if ((toDoID !== undefined && typeof toDoID !== "string") ||
      (pageId !== undefined && typeof pageId !== "string")) {
    return response.status(400).send("Invalid XFT redirect parameters");
  }
  let identity: any;
  try {
    identity = await wechatUserApiClient.getUserInfo(code);
  } catch (error) {
    logger.error(
      `[xft-sso] WeCom identity lookup failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return response.status(502).send("WeCom identity service unavailable");
  }
  const userid = typeof identity?.userid === "string" ? identity.userid.slice(0, 20) : "";
  if (!userid) {
    logger.warn(
      `[xft-sso] WeCom callback returned no userid; errcode=${String(
        identity?.errcode ?? "unknown"
      )}`
    );
    return response.status(401).send("Unable to identify WeCom user");
  }
  try {
    const url = await xftSSOApiClient.getSSOLink(userid, { todoId: toDoID, pageId });
    response.setHeader("Cache-Control", "no-store");
    return response.redirect(url);
  } catch {
    logger.error("[xft-sso] Connect SSO link generation failed");
    return response.status(502).send("XFT SSO service unavailable");
  }
};

export const testXftSSOLogin = async (_request: Request, response: Response) => {
  try {
    const url = await testLoginUrl("ceshi");
    response.setHeader("Cache-Control", "no-store");
    return response.redirect(url);
  } catch {
    return response.status(502).send("XFT SSO service unavailable");
  }
};

export const testLoginUrl = async (userid: string, todoId: string | null = null) => {
  return xftSSOApiClient.getSSOLink(userid, todoId ? { todoId } : {});
};
