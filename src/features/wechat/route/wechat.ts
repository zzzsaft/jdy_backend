import {
  syncAllWechatDepartments,
  syncAllWechatUsers,
  wechatWebHook,
  wechatWebHookCheck,
} from "../controller/wechat.controller";

export const WechatRoutes = [
  {
    path: "/wechat",
    method: "post",
    action: wechatWebHook,
  },
  {
    path: "/wechat",
    method: "get",
    action: wechatWebHookCheck,
  },
  {
    path: "/wechat/sync/departments/all",
    method: "post",
    action: syncAllWechatDepartments,
  },
  {
    path: "/wechat/sync/users/all",
    method: "post",
    action: syncAllWechatUsers,
  },
];
