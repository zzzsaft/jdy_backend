import _ from "lodash";
import { Department } from "../entity/wechat/Department";
import { User } from "../entity/wechat/User";
import { IDataQueryOption } from "../type/jdy/IOptions";
import { formDataApiClient } from "../utils/jdy/form_data";
import { userApiClient } from "../utils/wechat/department";
import cron from "node-cron";

const updateDepartmentList = async () => {
  const departmentList = await userApiClient.getDepartmentList();
  const result = [];
  departmentList["department"].forEach((department: any) => {
    result.push(
      Department.create({
        department_id: department.id,
        parent_id: department.parentid,
        name: department.name,
        department_leader: department.department_leader,
      })
    );
  });
  await Department.insertOrUpdateUsers(result);
};

export const updateUserList = async () => {
  let result = [];
  const existDepartment = await Department.find({ where: { is_exist: true } });
  const department_ids = existDepartment.map(
    (department) => department.department_id
  );

  for (const department_id of department_ids) {
    const userList = await userApiClient.getUserList(department_id);
    _.uniqBy(userList["userlist"], "userid").forEach((user: any) => {
      result.push(
        User.create({
          user_id: user.userid,
          name: user.name,
          is_employed: true,
          //   department_id: user.department,
        })
      );
    });
  }
  result = _.uniqBy(result, "user_id");
  await User.insertOrUpdateUsers(result);
};

export const updateUserByJdy = async () => {
  const { appid, entryid } = formDataApiClient.getFormId("员工档案");
  const option: IDataQueryOption = {
    limit: 100,
    filter: {
      rel: "and",
      cond: [
        {
          field: "_widget_1701399332764",
          method: "ne",
          value: ["离职"],
        },
        { field: "_widget_1691239227137", method: "not_empty" },
      ],
    },
    fields: ["_widget_1691239227137", "_widget_1705252329045"],
  };
  const userList = await formDataApiClient.batchDataQuery(
    appid,
    entryid,
    option
  );
  const result = [];
  userList.forEach((user: any) => {
    result.push({
      user_id: user._widget_1691239227137,
      attendance: user._widget_1705252329045,
    });
  });
  await User.upsert(result, ["user_id"]);
};

export const checkinDateScheduleAt1 = cron.schedule("* * 1 * * *", async () => {
  await updateUserList();
  await updateUserByJdy();
  await updateDepartmentList();
});
