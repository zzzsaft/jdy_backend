import {
  inParking,
  outParking,
  parking,
} from "../controllers/parking.controller";

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
];
