import { visitorService } from "../../services/visitorService";

export const 来宾预约单 = async (data) => {
  return await visitorService.handleInvite(data);
};
