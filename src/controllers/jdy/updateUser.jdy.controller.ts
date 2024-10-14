import { User } from "../../entity/basic/employee";
import { xftUserApiClient } from "../../utils/xft/xft_user";
import { format } from "date-fns";
import { isTaskFinished } from "./jdyUtil";
import { EmployeeLifecycle } from "../../entity/basic/employee_lifecycle";
import { xftSalaryApiClient } from "../../utils/xft/xft_salary";

export const 转正 = async (data) => {
  const bool = await isTaskFinished(data["_id"]);
  if (!bool) return;
  const userid = data["_widget_1695743055634"]["username"];
  const xft_id = await User.getXftId(userid);
  const 申请转正 = format(data["createTime"], "yyyy-MM-dd");
  const 计划转正 = format(data["execution_date"], "yyyy-MM-dd");
  const 实际转正 = format(data["_widget_1695743055643"], "yyyy-MM-dd");
  const name = data["full_name"];
  const base = data["_widget_1705745900328"];
  const month = data["_widget_1705745900260"];
  const annual = data["_widget_1705745900259"];
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "1",
      },
      staffHrmInfo: {
        actualPositiveDate: 实际转正,
        applyPositiveDate: 申请转正,
        planPositiveDate: 计划转正,
        positiveEvaluation: data["regular_assessment"],
      },
    },
  ]);
  const life = EmployeeLifecycle.create({
    name,
    userid,
    certificateId: data["_widget_1689416099607"],
    planDate: new Date(计划转正),
    actualDate: new Date(实际转正),
    departmentId: data["_widget_1689777486244"]["dept_no"],
    department: data["_widget_1689777486244"]["name"],
    type: "转正",
  });
  await EmployeeLifecycle.add(life);
  await xftSalaryApiClient.positiveSalary(
    name,
    userid,
    base,
    month,
    0,
    annual,
    实际转正
  );
};

export const 待离职 = async () => {
  const xft_id = await User.getXftId("");
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "3",
      },
    },
  ]);
};

export const 离职 = async (data) => {
  const bool = await isTaskFinished(data["_id"]);
  if (!bool) return;
  const userid = data["_widget_1702956728221"]["username"];
  const xft_id = await User.getXftId(userid);
  const 实际离职 = format(data["_widget_1702956727941"], "yyyy-MM-dd");
  const 申请离职 = format(data["createTime"], "yyyy-MM-dd");
  const 计划离职 = format(data["date_of_departure"], "yyyy-MM-dd");
  const name = data["applicant"];
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "2",
      },
      staffHrmInfo: {
        actualQuitDate: 实际离职,
        applyQuitDate: 申请离职,
        planQuitDate: 计划离职,
      },
    },
  ]);
  const life = EmployeeLifecycle.create({
    name,
    userid,
    certificateId: data["_widget_1689414359431"],
    planDate: new Date(计划离职),
    actualDate: new Date(实际离职),
    departmentId: data["_widget_1689779544087"]["dept_no"],
    department: data["_widget_1689779544087"]["name"],
    type: "离职",
  });
  await EmployeeLifecycle.add(life);
};

const 调岗 = async () => {};
