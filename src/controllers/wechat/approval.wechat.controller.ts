import { Approval } from "../../entity/wechat/Approval";
import { approvalApiClient } from "../../utils/wechat/approval";
import { ApplyData } from "../../type/wechat/IApproval";

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
