import { JdyWebhook } from "../../controllers/jdy/data.jdy.controller";

export const JdyDataRoutes = [
  {
    path: "/jdy/data",
    method: "post",
    action: JdyWebhook,
  },
];
