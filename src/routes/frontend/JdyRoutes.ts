import {
  getAppList,
  getEntryList,
  getFormWidgets,
} from "../../controllers/frontend/jdy.controller";

export const JdyRoutes = [
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
];
