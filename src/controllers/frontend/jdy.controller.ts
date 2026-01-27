import { Request, Response } from "express";
import { appApiClient } from "../../features/jdy/api/app";
import { formApiClient } from "../../features/jdy/api/form";

export const getAppList = async (request: Request, response: Response) => {
  response.send(await appApiClient.appList());
};
export const getEntryList = async (request: Request, response: Response) => {
  response.send(await appApiClient.entryList(request.params.app_id));
};
export const getFormWidgets = async (request: Request, response: Response) => {
  response.send(
    await formApiClient.formWidgets(
      request.query.app_id,
      request.query.entry_id
    )
  );
};
