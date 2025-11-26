import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { User } from "../../entity/basic/employee";
import { JdyUtil } from "../../utils/jdyUtils";
import { defaultWechatCorpConfig } from "../../config/wechatCorps";

class EmployeeService {
  appid = "5cfef4b5de0b2278b05c8380";
  entryid = "6414573264b9920007c82491";
  setBank = async (userid, bank, bankAccount) => {
    const user = await User.findOne({
      where: { user_id: userid, corp_id: defaultWechatCorpConfig.corpId },
    });
    if (!user) return;
    user.bank = bank;
    user.bankAccount = bankAccount;
    await user.save();
  };
  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        fields: [
          "_widget_1690873684141",
          "_widget_1690873684080",
          "_widget_1690274843463",
        ],
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1701399332764",
              method: "nin",
              value: ["离职"],
            },
            {
              field: "_widget_1690274843463",
              method: "not_empty",
              //    value: [""],
            },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };
  addJdyAlltoDb = async () => {
    const data = await this.findJdy();
    const c: User[] = [];
      for (const item of data) {
        const cus = User.create({
          corp_id: defaultWechatCorpConfig.corpId,
          user_id: JdyUtil.getUser(item["_widget_1690274843463"])?.username,
          bank: item["_widget_1690873684141"],
          bankAccount: item["_widget_1690873684080"],
        });
        c.push(cus);
      }
    await User.upsert(c, ["user_id", "corp_id"]);
  };
  getEmployeeToWeb = async (userid) => {
    return await User.findOne({
      where: { user_id: userid, corp_id: defaultWechatCorpConfig.corpId },
      select: ["user_id", "name", "avatar"],
    });
  };
  getAllUsers = async () => {
    return (
      await User.createQueryBuilder("user")
        .leftJoinAndSelect("user.department", "mainDept") // 关联部门表
        .where("mainDept.company = :companyName", {
          // 使用参数化查询防止SQL注入
          companyName: "浙江精诚模具机械有限公司",
        })
        .andWhere("user.corp_id = :corpId", {
          corpId: defaultWechatCorpConfig.corpId,
        })
        .andWhere("user.name is not null")
        .select([
          // 明确选择需要的字段
          "user.is_employed",
          "user.user_id",
          "user.name",
          "user.thumb_avatar",
          "mainDept.level1",
          "mainDept.level2",
          "mainDept.level3",
          "mainDept.level4",
          "mainDept.level5",
        ])
        .getRawMany()
    ).map((r) => {
      return {
        id: r.user_user_id,
        name: r.user_name,
        avatar: r.user_thumb_avatar,
        is_employed: r.user_is_employed,
        department: [
          r.mainDept_level1,
          r.mainDept_level2,
          r.mainDept_level3,
          r.mainDept_level4,
          r.mainDept_level5,
        ]
          .filter((d) => d)
          .join("/"),
      };
    });
  };
}

export const employeeService = new EmployeeService();
