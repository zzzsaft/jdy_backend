import { logger } from "../config/logger";
import { Department } from "../entity/wechat/Department";
import { xftOrgnizationApiClient } from "../utils/xft/xft_orgnization";
import { xftUserApiClient } from "../utils/xft/xft_user";
import cron from "node-cron";

function areArraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every((item) => arr2.includes(item));
}

export const syncDepartment = async () => {
  const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
    "records"
  ].filter((org: any) => org.status == "active");
  const wxDepartment = await Department.find({ where: { is_exist: true } });
  const xftUser = (await xftUserApiClient.getMemberList())["OPUSRLSTY"];
  const leaders = wxDepartment
    .filter((dep) => dep.department_leader.length != 0)
    .reduce((pre, cur) => {
      const { department_id, department_leader, name, parent_id } = cur;
      pre[department_id] = {
        leader: department_leader
          ?.map(
            (leader) =>
              xftUser.find((user) => user["STFNBR"] === leader)?.["USRNBR"]
          )
          .filter(Boolean),
        name,
        parent_id,
      };
      return pre;
    }, {});
  const result = xftOrg
    .map((org) => {
      const leaderData = leaders[org.code];
      if (
        leaderData &&
        (org["name"] !== leaderData.name ||
          !areArraysEqual(
            org["approvers"].map((app) => app["enterpriseUserId"]),
            leaderData.leader
          ))
      ) {
        const { name, parent_id, leader } = leaderData;
        return { id: org.id, name, parent_id, userids: leader };
      }
    })
    .filter(Boolean);
  for (let re of result) {
    if (re) {
      const a = await xftOrgnizationApiClient.updateOrgnization(re);
    }
  }
};
//每天的第 2 小时（即 2 点）触发任务
export const syncXft = cron.schedule("0 2 * * *", async () => {
  await syncDepartment();
  logger.info("checkinDateScheduleAt2");
});
