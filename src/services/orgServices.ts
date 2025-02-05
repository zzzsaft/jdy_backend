import { Department } from "../entity/basic/department";

class OrgServices {
  async isLeader(userid: string): Promise<boolean> {
    const departments = await Department.find({
      select: ["department_leader"],
    });
    for (const department of departments) {
      if (department.department_leader.includes(userid)) {
        return true;
      }
    }
    return false;
  }
  private async handleLevelName(department: Department): Promise<void> {
    let levelName: string[] = [];
    let departmentTemp = department;
    levelName.push(department.name);
    while (departmentTemp.parent_id != "1" && departmentTemp.parent_id != "0") {
      let parentDepartment =
        await departmentTemp.getParentDepartmentByParentId();
      if (parentDepartment) {
        departmentTemp = parentDepartment;
      } else break;
      levelName.push(departmentTemp.name);
    }
    department.company = levelName.pop() ?? "";
    department.level1 = levelName.pop() ?? "";
    department.level2 = levelName.pop() ?? "";
    department.level3 = levelName.pop() ?? "";
    department.level4 = levelName.pop() ?? "";
    department.level5 = levelName.pop() ?? "";
    department.level6 = levelName.pop() ?? "";
    department.level7 = levelName.pop() ?? "";
    department.save();
  }
  async updateAllDepartmentLevel(): Promise<void> {
    const departments = await Department.find();
    for (const department of departments) {
      await this.handleLevelName(department);
    }
  }
}

export const orgServices = new OrgServices();
