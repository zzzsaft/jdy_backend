import { GetAllTriggerInfos } from "../controllers/TriggerController/GetTriggerInfo";

/**
 * All application routes.
 */
export const TriggerRoutes = [
  {
    path: "/triggerInfos",
    method: "get",
    action: GetAllTriggerInfos,
  },
  // {
  //     path: "/posts/:id",
  //     method: "get",
  //     action: postGetByIdAction
  // },
  // {
  //     path: "/posts",
  //     method: "post",
  //     action: postSaveAction
  // }
];
