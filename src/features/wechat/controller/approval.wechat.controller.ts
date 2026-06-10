import { Approval } from "../../../entity/atd/wx_approval.js";
import { ApplyData } from "../../../type/wechat/IApproval.js";
import { approvalApiClient } from "../api/approval.js";

export const handleApprovalEvent = async (id, sp_status) => {
  if (Approval.hasId(id)) {
    await Approval.update(id, { sp_status: sp_status });
  } else {
    await getApprovalDetail(id);
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
