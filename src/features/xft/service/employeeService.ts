import _ from "lodash";
import { Department } from "../../../entity/basic/department";
import { User } from "../../../entity/basic/employee";
import { In, Like } from "typeorm";
import { defaultWechatCorpConfig } from "../../wechat/wechatCorps";
import { xftUserApiClient } from "../api/xft_user";
import { logger } from "../../../config/logger";

export class EmployeeService {
  static async syncUser() {
    try {
      logger.info("syncUser start");

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

      logger.info("syncUser done");
    } catch (error) {
      logger.error("syncUser failed");
      logger.error(error);
      throw error;
    }
  }

  static async getUser_id(xft_enterprise_id: string): Promise<string> {
    const user = await User.findOne({
      where: {
        xft_enterprise_id,
        is_employed: true,
        corp_id: defaultWechatCorpConfig.corpId,
      },
    });
    if (user) {
      return user.user_id;
    }

    const userid = (
      await xftUserApiClient.getEmployeeDetail(xft_enterprise_id)
    )["body"]?.["number"];
    if (!userid) {
      throw new Error(`User not found.${xft_enterprise_id}`);
    }

    const matchedUser = await User.findOne({
      where: {
        user_id: Like(`%${userid}%`),
        corp_id: defaultWechatCorpConfig.corpId,
      },
    });
    if (matchedUser) {
      matchedUser.xft_enterprise_id = xft_enterprise_id;
      await matchedUser.save();
    }
    return userid;
  }

  static async getXftEnterpriseId(userid: string): Promise<string> {
    const user = await User.findOne({
      where: { user_id: userid, corp_id: defaultWechatCorpConfig.corpId },
    });
    return user?.xft_enterprise_id ?? "";
  }

  static async getXftEnterpriseIdMap(
    userIds: string[]
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (ids.length === 0) {
      return new Map();
    }
    const users = await User.find({
      where: {
        user_id: In(ids),
        corp_id: defaultWechatCorpConfig.corpId,
      },
      select: ["user_id", "xft_enterprise_id"],
    });
    return new Map(
      users.map((user) => [user.user_id, user.xft_enterprise_id ?? ""])
    );
  }

  static async getXftId(userid: string): Promise<string> {
    const user = await User.findOne({
      where: { user_id: userid, corp_id: defaultWechatCorpConfig.corpId },
    });
    return user?.xft_id ?? "";
  }
}
