import _ from "lodash";
import { logger } from "../config/logger";
import { Department } from "../entity/basic/department";
import { User } from "../entity/basic/employee";
import cron from "node-cron";
import { IsNull, Not } from "typeorm";
import { defaultWechatCorpConfig } from "../features/wechat/wechatCorps";
import { xftUserApiClient } from "../features/xft/api/xft_user";
import { xftOrgnizationApiClient } from "../features/xft/api/xft_orgnization";

function areArraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every((item) => arr2.includes(item));
}

export const syncUser = async () => {
  const users = (
    await User.createQueryBuilder("user")
      .where("user.is_employed = true")
      .andWhere("user.corp_id = :corpId", {
        corpId: defaultWechatCorpConfig.corpId,
      })
      .innerJoinAndSelect(
        Department,
        "department",
        "user.main_department_id = department.department_id AND user.corp_id = department.corp_id"
      )
      .getRawMany()
  )
    .map((user) => {
      return {
        stfSeq: user.user_xft_id,
        orgSeq: user.department_xft_id,
      };
    })
    .filter((user) => user.stfSeq && user.orgSeq);
  const employeeList = (await xftUserApiClient.getAllEmployeeList()).map(
    (item) => {
      return { stfSeq: item.staffSeq, orgSeq: item.staffBasicInfo.orgSeq };
    }
  );
  const update = _.filter(users, (item1) => {
    const match = _.find(
      employeeList,
      (item2) => item2.stfSeq === item1.stfSeq
    );
    return match && match.orgSeq !== item1.orgSeq;
  }).map((item: any) => {
    return { staffBasicInfo: { stfSeq: item.stfSeq, orgSeq: item.orgSeq } };
  });
  if (update.length > 0) {
    await xftUserApiClient.updateEmployee(update);
  }
  // const chunks = _.chunk(users, 500);

  // for (let chunk of chunks) {
  //   await xftUserApiClient.updateEmployee(chunk);
  // }
};

export const syncDepartment = async () => {
  const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
    "records"
  ].filter((org: any) => org.status == "active");
  const departments = await Department.find({
    where: {
      parent_id: Not(IsNull()),
      department_leader: Not(IsNull()),
      corp_id: defaultWechatCorpConfig.corpId,
    },
  });
  const datas = (
    await Promise.all(
      departments.map(async (department) => {
        let parent_id = department.parent_id.toString();
        // if (parent_id === "1") {
        //   parent_id = "root";
        // }
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
          exist: department.is_exist,
          xftid: department.xft_id,
        };
      })
    )
  ).filter((department) => department.id !== "1");
  const xftDepartmentIds = xftOrg.map((department) => department.code);
  const stop = datas
    .filter(
      (data) => xftDepartmentIds.includes(data.id) && !data.exist && data.xftid
    )
    .map((data) => {
      return { ORGSEQ: data.xftid };
    });
  if (stop.length > 0) await xftOrgnizationApiClient.stopOrgnization(stop);

  const add = datas.filter(
    (data) => data.exist && !xftDepartmentIds.includes(data.id)
  );
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
          ) ||
          org["parentCode"] !== data.parent_id)
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
