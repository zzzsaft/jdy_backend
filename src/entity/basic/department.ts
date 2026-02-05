import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";

@Entity({ name: "md_department" })
export class Department extends BaseEntity {
  @PrimaryColumn({ name: "corp_id" })
  corp_id: string;
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

  static async isLeader(userid: string): Promise<boolean> {
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
}
