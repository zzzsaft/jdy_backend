import {
  GetAllTriggerInfos,
  GetTrigger,
  createTriggerInfos,
  deleteTriggerInfos,
  updateTriggerInfos,
} from "../../controllers/frontend/triggerInfo.controller";

/**
 * All application routes.
 */
export const TriggerRoutes = [
  {
    path: "/trigger/getAllTriggers",
    method: "get",
    action: GetAllTriggerInfos,
  },
  {
    path: "/trigger/get/:id",
    method: "get",
    action: GetTrigger,
  },
  {
    path: "/trigger/delete/",
    method: "post",
    action: deleteTriggerInfos,
  },
  {
    path: "/trigger/post",
    method: "post",
    action: createTriggerInfos,
  },
  {
    path: "/trigger/update",
    method: "post",
    action: updateTriggerInfos,
  },
];
