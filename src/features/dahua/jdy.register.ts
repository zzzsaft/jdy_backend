import { registerJdy } from "../../controllers/jdy/jdy.registry";
import { updateExistInfo } from "./service/dahuaServices";
import { saveNewInfotoDahua } from "./service/employeeOnboardingService";

registerJdy(
  // 表单名: 员工档案
  "5cfef4b5de0b2278b05c8380",
  "6414573264b9920007c82491",
  "data_update",
  updateExistInfo
);

registerJdy(
  // 表单名: 入职申请
  "5cfef4b5de0b2278b05c8380",
  "5cfef54d0fc84505a1d270f4",
  "data_create",
  async (data) => await saveNewInfotoDahua(data)
);
