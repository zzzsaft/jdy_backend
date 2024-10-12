import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";
import { contactApiClient } from "../../utils/wechat/contact";
import { xftOrgnizationApiClient } from "../../utils/xft/xft_orgnization";

@Entity({ name: "md_department" })
export class Department extends BaseEntity {
  @PrimaryColumn()
  department_id: string;
  @Column({ nullable: true })
  xft_id: string;
  @Column({ nullable: true })
  parent_id: string;
  @Column({ nullable: true })
  name: string;
  @Column("simple-array", { nullable: true })
  department_leader: string[];
  @Column({ nullable: true })
  company: string;
  @Column({ nullable: true })
  level1: string;
  @Column({ nullable: true })
  level2: string;
  @Column({ nullable: true })
  level3: string;
  @Column({ nullable: true })
  level4: string;
  @Column({ nullable: true })
  level5: string;
  @Column({ nullable: true })
  level6: string;
  @Column({ nullable: true })
  level7: string;
  @Column({ nullable: true, default: true })
  is_exist: boolean;

  async getParentDepartmentByParentId(): Promise<Department | null> {
    try {
      const parentDepartment = await Department.findOne({
        where: { department_id: this.parent_id },
      });
      return parentDepartment;
    } catch (error) {
      // 处理错误
      logger.error("Error fetching parent department:", error);
      return null;
    }
  }

  static async handleLevelName(department: Department): Promise<void> {
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

  static async updateAllDepartmentLevel(): Promise<void> {
    const departments = await Department.find();
    for (const department of departments) {
      await Department.handleLevelName(department);
    }
  }

  static async updateDepartment(): Promise<void> {
    const existDepartments = await Department.find({
      where: { is_exist: true },
    });
    const departmentList = await contactApiClient.getDepartmentList();
    const result = departmentList["department"].map((department: any) => {
      return {
        department_id: department.id.toString(),
        parent_id: department.parentid.toString(),
        name: department.name,
        department_leader: department.department_leader,
        is_exist: true,
      };
    });
    await Department.upsert(result, {
      conflictPaths: ["department_id"],
      skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
    });
    existDepartments
      .filter(
        (department) =>
          !result.map((d) => d.department_id).includes(department.department_id)
      )
      .forEach(async (department) => {
        department.is_exist = false;
        await department.save();
      });
  }

  static async updateXftId(): Promise<void> {
    const xftOrg = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
      "records"
    ]
      .filter((org: any) => org.status == "active")
      .map((org: any) => {
        return {
          xft_id: org["id"],
          department_id: org["code"],
        };
      });
    await Department.upsert(xftOrg, {
      conflictPaths: ["department_id"],
      skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
    });
  }
}
