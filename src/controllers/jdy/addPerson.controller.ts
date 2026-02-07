import { EmployeeLifecycle } from "../../entity/basic/employee_lifecycle";
import { SalaryRecord } from "../../entity/basic/salary-record";
export const 入职申请表 = async (data) => {
  await SalaryRecord.addRecord({
    userid: data["_widget_1720801227437"],
    probation: data.salary_during_probation_period,
    positive: data._widget_1705741401338,
  });
  await addToDb(data);
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const addToDb = async (user) => {
  const life = EmployeeLifecycle.create({
    name: user["full_name"],
    userid: user["_widget_1720801227437"],
    certificateId: user["id_card_number"],
    actualDate: formatDate(user["entry_time"]),
    departmentId: user["_widget_1702572867837"],
    type: "入职",
  });
  await EmployeeLifecycle.add(life);
};
