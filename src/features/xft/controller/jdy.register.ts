import { registerJdy } from "../../../controllers/jdy/jdy.registry";
import { addEmployeeToXft } from "../service/employeeOnboardingService";

registerJdy(
  // 表单名: 入职申请
  "5cfef4b5de0b2278b05c8380",
  "5cfef54d0fc84505a1d270f4",
  "data_create",
  async (data) => await addEmployeeToXft(data)
);
