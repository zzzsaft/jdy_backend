import { registerJdy } from "../../controllers/jdy/jdy.registry";
import { 入职申请表 } from "../../controllers/jdy/addPerson.controller";
import { 离职, 转正 } from "../../controllers/jdy/updateUser.jdy.controller";
import { hrContractService } from "./service/hrContractService";

registerJdy(
  // 表单名: 入职申请
  "5cfef4b5de0b2278b05c8380",
  "5cfef54d0fc84505a1d270f4",
  "data_create",
  入职申请表
);

registerJdy(
  // 表单名: 转正审批
  "5cfef4b5de0b2278b05c8380",
  "5c862c6e2444081a3681f651",
  "data_update",
  转正
);

registerJdy(
  // 表单名: 离职申请
  "5cfef4b5de0b2278b05c8380",
  "6580fbeabeab377a1508c1a1",
  "data_update",
  离职
);

registerJdy(
  // 表单名: 电子合同签订
  "5cfef4b5de0b2278b05c8380",
  "64b915fe3b3b7c0008316594",
  "data_create",
  async (data) => await hrContractService.handleCreate(data)
);
