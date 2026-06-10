import { handleFBT } from "../../../controllers/fengbeitong.controller.js";

export const fenbeitongRoutes = [
  {
    path: "/fenbeitong",
    method: "post",
    action: handleFBT,
  },
  {
    path: "/fenbeitong/test",
    method: "post",
    action: handleFBT,
  },
];
