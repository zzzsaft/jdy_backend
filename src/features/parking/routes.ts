import {
  dahuaCallback,
  entryExistRecord,
  inParking,
  outParking,
  parking,
} from "../../controllers/parking.controller";

export const parkingRoutes = [
  {
    path: "/parking",
    method: "post",
    action: parking,
  },
  {
    path: "/parking/in",
    method: "post",
    action: inParking,
  },
  {
    path: "/parking/out",
    method: "post",
    action: outParking,
  },
  {
    path: "/parking/v2",
    method: "post",
    action: entryExistRecord,
  },
  {
    path: "/dahua",
    method: "post",
    action: dahuaCallback,
  },
];
//http://116.148.160.12:9080/jeecg-boot/dahua/msg/save
