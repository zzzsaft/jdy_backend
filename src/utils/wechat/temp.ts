import { getApprovalDetail } from "../../controllers/wechat/approval.wechat.controller";
import { approvalApiClient } from "./approval";
import _ from "lodash";

const getApprovalList = async () => {
  const starttime = new Date("2024-4-8").getTime() / 1000;
  const nowDay = new Date("2024-4-9").getTime() / 1000;
  const timestamps = _.range(starttime, nowDay, 60 * 60 * 24 * 2);
  const periods = _.zip(timestamps, _.drop(timestamps, 1).concat([nowDay]));
  const approvalList = [];
  let cursor = "";
  let flag = true;
  for (const period of periods) {
    while (flag) {
      const result = await approvalApiClient.getApprovalList({
        starttime: period[0].toString(),
        endtime: period[1].toString(),
        new_cursor: cursor,
        size: 100,
      });
      approvalList.push(...result["sp_no_list"]);
      cursor = result["new_next_cursor"] ?? "";
      if (cursor === "") {
        flag = false;
      }
    }
    flag = true;
  }
  return approvalList;
};
export const insertApprovalToDb = async () => {
  const approvalList = await getApprovalList();
  for (const sp_no of approvalList) {
    await getApprovalDetail(sp_no);
  }
};
