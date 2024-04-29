import { Approval } from "../../entity/wechat/Approval";
import { approvalApiClient } from "../../utils/wechat/approval";
import { ApplyData } from "../../type/wechat/IApproval";
import { orgnizationApiClient } from "../../utils/xft/orgnization";
import { contactApiClient } from "../../utils/wechat/contact";
import { logger } from "../../config/logger";

export const handleContactEvent = async (msg: any) => {
  const UserID = msg["UserID"]["value"];
  const Department = msg["Department"]["value"];
  let data;
  switch (msg["ChangeType"]["value"]) {
    case "create_user":
      break;
    case "update_user":
      break;
    case "delete_user":
      break;
    case "create_party":
      data = await contactApiClient.getDepartmentInfo(msg["Id"]["value"]);
      await orgnizationApiClient.addOrgnization({
        id: msg["Id"]["value"],
        name: data["department"]["name"] ?? "error",
        parent_id: msg["ParentId"]["value"],
      });
      break;
    case "update_party":
      data = await contactApiClient.getDepartmentInfo(msg["Id"]["value"]);
      let org = await orgnizationApiClient.getOrgnization(msg["Id"]["value"]);
      let orgid = org["OPORGQRYZ"][0]["ORGSEQ"];
      if (!orgid) logger.error(`orgid not found${org}`);
      await orgnizationApiClient.updateOrgnization({
        id: msg["Id"]["value"],
        name: data["department"]["name"] ?? "error",
        parent_id: msg["ParentId"]["value"],
      });
      break;
    case "delete_party":
      break;
    default:
      break;
  }
};

export const getApprovalDetail = async (sp_no) => {
  const detail = await approvalApiClient.getApprovalDetail(sp_no);
  // console.log(detail["info"]);
  const approval = await Approval.create({
    ...detail["info"],
    userid: detail["info"]["applyer"]["userid"],
    apply_data: detail["info"]["apply_data"]["contents"],
    unix_apply_time: detail["info"]["apply_time"],
    notifyer: detail["info"]["notifyer"].map((item) => item["userid"]),
  });
  await approval.save();
};
