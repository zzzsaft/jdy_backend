import {
  bestSignNotification,
  downloadContractFiles,
  rejectContract,
  sendContractByTemplate,
  approveContract,
  signContract,
} from "../controller/bestsign.controller";

export const BestSignRoutes = [
  {
    path: "/bestsign/contract/send-by-template",
    method: "post",
    action: sendContractByTemplate,
  },
  {
    path: "/bestsign/contract/notify",
    method: "post",
    action: bestSignNotification,
  },
  {
    path: "/bestsign/contract/reject",
    method: "post",
    action: rejectContract,
  },
  {
    path: "/bestsign/contract/download",
    method: "post",
    action: downloadContractFiles,
  },
  {
    path: "/bestsign/contract/approve",
    method: "post",
    action: approveContract,
  },
  {
    path: "/bestsign/contract/sign",
    method: "post",
    action: signContract,
  },
];
