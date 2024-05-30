import _ from "lodash";
import { logger } from "../config/logger";
import { Department } from "../entity/wechat/Department";
import { User } from "../entity/wechat/User";
import { xftOrgnizationApiClient } from "../utils/xft/xft_orgnization";
import { xftUserApiClient } from "../utils/xft/xft_user";
import cron from "node-cron";

function areArraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every((item) => arr2.includes(item));
}

export const syncUser = async () => {
  const users = (
    await User.createQueryBuilder("user")
      .innerJoinAndSelect(
        Department,
        "department",
        "user.main_department_id = department.department_id"
      )
      .getRawMany()
  )
    .map((user) => {
      return {
        staffBasicInfo: {
          stfSeq: user.user_xft_id,
          orgSeq: user.department_xft_id,
        },
      };
    })
    .filter((user) => user.staffBasicInfo.stfSeq && user.staffBasicInfo.orgSeq);
  _.chunk(users, 1000).forEach(async (chunk) => {
    await xftUserApiClient.updateEmployee(chunk);
  });
};

export const syncDepartment = async () => {
  const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
    "records"
  ].filter((org: any) => org.status == "active");
  const departments = await Department.find({ where: { is_exist: true } });
  const datas = (
    await Promise.all(
      departments.map(async (department) => {
        let parent_id = department.parent_id.toString();
        if (parent_id === "1") {
          parent_id = "root";
        }
        let leaders = (
          await Promise.all(
            department.department_leader.map(
              async (leader) => await User.getXftEnterpriseId(leader)
            )
          )
        ).filter((leader) => leader !== "");
        return {
          name: department.name,
          id: department.department_id,
          parent_id: parent_id,
          approverIds: leaders,
        };
      })
    )
  ).filter((department) => department.id !== "1");
  const xftDepartmentIds = xftOrg.map((department) => department.code);
  const add = datas.filter((data) => !xftDepartmentIds.includes(data.id));
  for (let data of add) {
    await xftOrgnizationApiClient.addOrgnization(data);
  }
  const update = xftOrg
    .map((org) => {
      const data = datas.find((data) => data.id === org.code);
      if (
        data &&
        (org["name"] !== data.name ||
          !areArraysEqual(
            org["approvers"].map((app) => app["enterpriseUserId"]),
            data.approverIds
          ))
      ) {
        const { name, parent_id, approverIds } = data;
        return { id: org.id, name, parent_id, userids: approverIds };
      }
    })
    .filter(Boolean);
  for (let re of update) {
    if (re) {
      await xftOrgnizationApiClient.updateOrgnization(re);
    }
  }
};

export const syncXft = async () => {
  await syncUser();
  await syncDepartment();
  logger.info("syncXft");
};
