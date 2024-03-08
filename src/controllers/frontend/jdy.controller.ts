import { Request, Response } from "express";
import appApiClient from "../../utils/jdy/app";
export const getAppList = async (request: Request, response: Response) => {
  response.send(await appApiClient.appList());
};
export const getEntryList = async (request: Request, response: Response) => {
  response.send(await appApiClient.entryList(request.params.app_id));
};
