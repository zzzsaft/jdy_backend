import { In, IsNull } from "typeorm";
import { getCorpList } from "../../../config/wechatCorps";
import { Department } from "../../../entity/basic/department";
import { User } from "../../../entity/basic/employee";
import { xftUserApiClient } from "../../xft/api/xft_user";
import { contactApiClient } from "../api/contact";

export const syncUsers = async (corpId?: string): Promise<void> => {
  const corpConfigs = getCorpList(corpId);
  const targetCorpIds = corpConfigs.map((config) => config.corpId);
  const existUserIds = await User.find({
    where: [
      { is_employed: true, corp_id: In(targetCorpIds) },
      { is_employed: IsNull(), corp_id: In(targetCorpIds) },
    ],
  });
  let result: User[] = [];

  for (const config of corpConfigs) {
    const existDepartment = await Department.find({
      where: { is_exist: true, corp_id: config.corpId },
    });
    const departmentIds = existDepartment.map(
      (department) => department.department_id
    );

    for (const departmentId of departmentIds) {
      const userList = await contactApiClient.getUserList(
        departmentId,
        config.corpId
      );
      const users = userList.userlist.map((user) => {
        return {
          corp_id: config.corpId,
          corp_name: config.name ?? config.corpId,
          user_id: user.userid,
          name: user.name,
          is_employed: true,
          department_id: user.department,
          main_department_id: user.main_department,
          position: user.position,
          is_leader_in_dept: user.is_leader_in_dept,
          mobile: user.mobile,
          avatar: user.avatar,
          thumb_avatar: user.thumb_avatar,
        } as User;
      });
      result = result.concat(users);
      await User.upsert(users, {
        conflictPaths: ["user_id", "corp_id"],
        skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
      });
    }
  }

  const leavedEmployee = existUserIds.filter(
    (user) =>
      !result
        .map((u) => `${u.corp_id}:${u.user_id}`)
        .includes(`${user.corp_id}:${user.user_id}`)
  );
  for (const user of leavedEmployee) {
    user.is_employed = false;
    await user.save();
  }
};

export const syncXftUserIds = async (corpId: string): Promise<void> => {
  const xftUsers = (await xftUserApiClient.getMemberList())["OPUSRLSTY"]
    .map((user) => {
      return {
        corp_id: corpId,
        user_id: user["STFNBR"],
        xft_id: user["STFSEQ"],
        xft_enterprise_id: user["USRNBR"],
      };
    })
    .filter((user) => user.user_id);
  const users = Array.from(
    new Map(xftUsers.map((user) => [user.user_id, user])).values()
  );
  await User.upsert(users, {
    conflictPaths: ["user_id", "corp_id"],
    skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
  });
};
