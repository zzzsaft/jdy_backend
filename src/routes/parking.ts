import { parking } from "../controllers/parking.controller";

export const parkingRoute = {
  path: "/parking",
  method: "post",
  action: parking,
};
