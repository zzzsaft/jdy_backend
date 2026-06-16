import type { Request, Response } from "express";
import { appApiClient } from "../../jdy/api/app.js";
import { formApiClient } from "../../jdy/api/form.js";

const getAppList = async (_request: Request, response: Response) => {
  response.send(await appApiClient.appList());
};

const getEntryList = async (request: Request, response: Response) => {
  response.send(await appApiClient.entryList(request.params.app_id));
};

const getFormWidgets = async (request: Request, response: Response) => {
  response.send(
    await formApiClient.formWidgets(
      request.query.app_id,
      request.query.entry_id,
    ),
  );
};

export const FrontendJdyRoutes = [
  {
    path: "/frontend/jdy/getAppList",
    method: "get",
    action: getAppList,
  },
  {
    path: "/frontend/jdy/getEntryList/:app_id",
    method: "get",
    action: getEntryList,
  },
  {
    path: "/frontend/jdy/getFormWidgets",
    method: "get",
    action: getFormWidgets,
  },
  {
    path: "/frontend/company",
    method: "get",
    action: getFormWidgets,
  },
];
