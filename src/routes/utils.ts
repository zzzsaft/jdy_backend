import { isLicensePlate } from "../controllers/utils.controllers";

export const UtilsRoutes = [
  {
    path: "/utils/plate/:license_plate",
    method: "get",
    action: isLicensePlate,
  },
];
