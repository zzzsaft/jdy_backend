import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";
import { contactApiClient } from "../../utils/wechat/contact";
import { xftOrgnizationApiClient } from "../../utils/xft/xft_orgnization";

@Entity()
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
  first_name: string;
  @Column({ nullable: true })
  second_name: string;
  @Column({ nullable: true })
  third_name: string;
  @Column({ nullable: true })
  fourth_name: string;
  @Column({ nullable: true, default: true })
  is_exist: boolean;

  parent_department: Department;

  async getParentDepartmentByParentId(): Promise<Department | undefined> {
    try {
      const department = await Department.findOne({
        where: { department_id: this.parent_id },
      });
      return department?.parent_department;
    } catch (error) {
      // 处理错误
      logger.error("Error fetching parent department:", error);
      return undefined;
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
