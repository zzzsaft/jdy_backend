import { registerJdy } from "../../controllers/jdy/jdy.registry";
import { businessTripCheckinServices } from "./service/businessTripCheckinServices";
import { restOvertimeServices } from "./service/restOvertimeServices";

registerJdy(
  // 表单名: 出差信息填报
  "5cfef4b5de0b2278b05c8380",
  "65dc463c9b200f9b5e3b5851",
  "data_create",
  businessTripCheckinServices.dataProcess
);
registerJdy(
  // 表单名: 出差信息填报
  "5cfef4b5de0b2278b05c8380",
  "65dc463c9b200f9b5e3b5851",
  "data_update",
  businessTripCheckinServices.dataUpdate
);

registerJdy(
  // 表单名: 加班申请表
  "5cfef4b5de0b2278b05c8380",
  "64ccdcf9a03b0f000875fcde",
  "data_create",
  restOvertimeServices.add
);
registerJdy(
  // 表单名: 加班申请表
  "5cfef4b5de0b2278b05c8380",
  "64ccdcf9a03b0f000875fcde",
  "data_update",
  restOvertimeServices.add
);
