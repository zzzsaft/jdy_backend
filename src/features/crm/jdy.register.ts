import { registerJdy } from "../../controllers/jdy/jdy.registry";
import { customerServices } from "../../services/crm/customerService";
import { productService } from "../../services/crm/productService";

const createCustomer = async (data) => {
  if (!["设备厂家", "最终用户"].includes(data["_widget_1740442384783"])) return;
  if (!data["account_name"]) return;
  await customerServices.updateJdy(data["_id"], data["account_name"]);
  await customerServices.upsertToDb(data);
};

const updateCustomer = async (data) => {
  if (!["设备厂家", "最终用户"].includes(data["_widget_1740442384783"])) return;
  if (!data["_widget_1740848672029"] && data["_widget_1740674945157"]) {
    await customerServices.updateJdy(data["_id"], data["account_name"]);
  }
  await customerServices.upsertToDb(data);
};

registerJdy(
  // 表单名: 未知
  "6191e49fc6c18500070f60ca",
  "020100200000000000000001",
  "data_create",
  createCustomer
);
registerJdy(
  // 表单名: 未知
  "6191e49fc6c18500070f60ca",
  "020100200000000000000001",
  "data_update",
  updateCustomer
);

registerJdy(
  // 表单名: 未知
  "6191e49fc6c18500070f60ca",
  "60458a6440c90e0008c75561",
  "data_create",
  async (data) => await productService.saveToDb(data)
);
registerJdy(
  // 表单名: 未知
  "6191e49fc6c18500070f60ca",
  "60458a6440c90e0008c75561",
  "data_update",
  async (data) => await productService.saveToDb(data)
);
