import { Department } from "../../../entity/basic/department";
import { IsNull, Not } from "typeorm";
import { defaultWechatCorpConfig } from "../../wechat/wechatCorps";
import { xftOrgnizationApiClient } from "../api/xft_orgnization";
import { logger } from "../../../config/logger";
import { EmployeeService } from "./employeeService";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function areArraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every((item) => arr2.includes(item));
}

export class OrgnizationService {
  static async getActiveXftOrgnizations() {
    const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
      "records"
    ].filter((org: any) => org.status == "active");
    return xftOrg;
  }

  static async syncManualOrgnizationCodes(xftOrg: any[]) {
    // if (!process.stdin.isTTY) {
    //   logger.warn("skip manual org code sync: stdin is not TTY");
    //   return;
    // }

    const manualOrgs = xftOrg.filter(
      (org) => !org.code || String(org.code).trim() === ""
    );
    if (manualOrgs.length === 0) {
      logger.info("no manual orgs with empty code");
      return;
    }

    const prompt = createInterface({ input, output });
    try {
      for (const org of manualOrgs) {
        const candidates = await Department.find({
          where: {
            name: org.name,
            corp_id: defaultWechatCorpConfig.corpId,
          },
        });

        if (candidates.length === 0) {
          logger.warn(`manual org not matched by name: ${org.name}`);
          continue;
        }

        if (candidates.length > 1) {
          logger.warn(
            `manual org name matched multiple departments: ${org.name}`
          );
          continue;
        }

        const department = candidates[0];
        const defaultCode = department.department_id;
        const answer = await prompt.question(
          `XFT org "${org.name}"(id=${org.id}) code is empty. Set code to which value? (default: ${defaultCode}) `
        );
        const code = (answer || "").trim() || defaultCode;
        if (!code) {
          logger.warn(`skip org ${org.id}: empty code input`);
          continue;
        }

        const result = await xftOrgnizationApiClient.updateOrgnizationCode({
          id: org.id,
          code,
          name: org.name,
          parent_id: org.parentCode,
        });

        if (result?.["returnCode"] === "SUC0000") {
          department.xft_id = org.id;
          await department.save();
          org.code = code;
          logger.info(
            `updated org code success: name=${org.name} id=${org.id} code=${code}`
          );
        } else {
          logger.error(
            `update org code failed: name=${org.name} id=${org.id} code=${code}`
          );
          logger.error(result);
        }
      }
    } finally {
      prompt.close();
    }
  }

  static async syncParentCodes(
    xftOrg: any[],
    datas: {
      id: string;
      name: string;
      parent_id: string;
      approverIds: string[];
    }[]
  ) {
    const dataById = new Map(datas.map((item) => [item.id, item]));
    const needParentUpdate = xftOrg
      .map((org) => {
        const data = dataById.get(org.code);
        if (!data) {
          return null;
        }
        if (org.parentCode !== data.parent_id) {
          return {
            id: org.id,
            name: data.name,
            parent_id: data.parent_id,
            userids: data.approverIds,
            code: org.code,
            oldParent: org.parentCode,
          };
        }
        return null;
      })
      .filter(Boolean) as {
      id: string;
      name: string;
      parent_id: string;
      userids: string[];
      code: string;
      oldParent: string;
    }[];

    for (const item of needParentUpdate) {
      logger.info(
        `update parentCode: code=${item.code} old=${item.oldParent} new=${item.parent_id}`
      );
      await xftOrgnizationApiClient.updateOrgnization({
        id: item.id,
        name: item.name,
        parent_id: item.parent_id,
        userids: item.userids,
      });
    }
  }

  static async syncDepartment() {
    try {
      logger.info("syncDepartment start");

      const xftOrg = await OrgnizationService.getActiveXftOrgnizations();
      // await OrgnizationService.syncManualOrgnizationCodes(xftOrg);

      const departments = (
        await Department.find({
          where: {
            parent_id: Not(IsNull()),
            department_leader: Not(IsNull()),
            corp_id: defaultWechatCorpConfig.corpId,
          },
        })
      ).filter((department) => department.company !== "浙江精一新材料有限公司");

      const leaderIds = departments.flatMap(
        (department) => department.department_leader ?? []
      );
      const leaderIdMap = await EmployeeService.getXftEnterpriseIdMap(
        leaderIds
      );

      const datas = departments
        .map((department) => {
          let parent_id = department.parent_id?.toString() ?? "";
          // if (parent_id === "1") {
          //   parent_id = "root";
          // }
          const leaders = (department.department_leader ?? [])
            .map((leader) => leaderIdMap.get(leader) ?? "")
            .filter((leader) => leader !== "");

          return {
            name: department.name,
            id: department.department_id,
            parent_id: parent_id,
            approverIds: leaders,
            exist: department.is_exist,
            xftid: department.xft_id,
          };
        })
        .filter((department) => department.id !== "1");

      const xftDepartmentIds = xftOrg.map((department) => department.code);

      await OrgnizationService.syncParentCodes(xftOrg, datas);

      const stop = datas
        .filter(
          (data) =>
            xftDepartmentIds.includes(data.id) && !data.exist && data.xftid
        )
        .map((data) => {
          return { ORGSEQ: data.xftid };
        });

      if (stop.length > 0) {
        await xftOrgnizationApiClient.stopOrgnization(stop);
      }

      const add = datas.filter(
        (data) => data.exist && !xftDepartmentIds.includes(data.id)
      );

      // for (let data of add) {
      //   await xftOrgnizationApiClient.addOrgnization(data);
      // }

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

      logger.info("syncDepartment done");
    } catch (error) {
      logger.error("syncDepartment failed");
      logger.error(error);
      throw error;
    }
  }
}
