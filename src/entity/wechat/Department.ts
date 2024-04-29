import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";

@Entity()
export class Department extends BaseEntity {
  @PrimaryColumn()
  department_id: number;
  @Column({ nullable: true })
  parent_id: number;
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
  static async insertOrUpdateDepartment(
    departments: Department[]
  ): Promise<void> {
    try {
      // 1. 找出数据库中所有 is_employed 为 true 的用户
      const existDepartment = await Department.find({
        where: { is_exist: true },
      });

      // 2. 更新数据库中 is_employed 为 true 的用户，但不在传入的 users 数组中的用户的状态为 false
      existDepartment
        .filter(
          (dbDepartment) =>
            !departments.some(
              (department) =>
                department.department_id === dbDepartment.department_id
            )
        )
        .forEach((dbDepartment) => {
          dbDepartment.is_exist = false;
        });

      // 4. 保存更新后的用户信息和新用户
      await Department.save([...existDepartment, ...departments]);

      logger.info("Department inserted or updated successfully.");
    } catch (error) {
      // 处理错误
      logger.error("Error inserting or updating departments:", error);
      throw error;
    }
  }
}
