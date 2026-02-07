import { registerJdy } from "../../../../controllers/jdy/jdy.registry";
import {
  addCar,
  deleteCar,
  punishCar,
  updateCar,
} from "./parking.jdy.contollers";
import { 来宾预约单 } from "./visitor.controller";

registerJdy(
  // 表单名: 车辆信息登记
  "5cd65fc5272c106bbc2bbc38",
  "668cf9e8bb998350eae3bae6",
  "data_create",
  addCar
);
registerJdy(
  // 表单名: 车辆信息登记
  "5cd65fc5272c106bbc2bbc38",
  "668cf9e8bb998350eae3bae6",
  "data_update",
  updateCar
);
registerJdy(
  // 表单名: 车辆信息登记
  "5cd65fc5272c106bbc2bbc38",
  "668cf9e8bb998350eae3bae6",
  "data_remove",
  deleteCar
);

registerJdy(
  // 表单名: 未知
  "5cd65fc5272c106bbc2bbc38",
  "668d244cbae980236ab4e62c",
  "data_update",
  punishCar
);

registerJdy(
  // 表单名: 来宾预约单
  "5cd2228a0be7121e839d41bc",
  "5dc4d7036ba9010006388e1d",
  "data_create",
  来宾预约单
);
