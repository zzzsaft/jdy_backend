import { Entity, Column, BaseEntity, PrimaryColumn, In } from "typeorm";
import { logger } from "../../config/logger";
import { contactApiClient } from "../../api/wechat/contact";
import { xftOrgnizationApiClient } from "../../api/xft/xft_orgnization";
import { defaultWechatCorpConfig, getCorpList } from "../../config/wechatCorps";

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

  static async handleLevelName(
    department: Department,
    departments: Department[]
  ) {
    let levelName: string[] = [];
    let departmentTemp = department;
    levelName.push(department.name);
    while (departmentTemp.parent_id != "1" && departmentTemp.parent_id != "0") {
      let parentDepartment = departments.find(
        (d) =>
          d.department_id == departmentTemp.parent_id &&
          d.corp_id === department.corp_id
      );
      // await departmentTemp.getParentDepartmentByParentId();
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
    return department;
  }

  static async updateAllDepartmentLevel(corpId?: string): Promise<void> {
    const corpConfigs = getCorpList(corpId);
    const updatedDepartments: Department[] = [];

    for (const config of corpConfigs) {
      const departments = await Department.find({
        where: { corp_id: config.corpId },
      });

      for (const department of departments) {
        updatedDepartments.push(
          await Department.handleLevelName(department, departments)
        );
      }
    }

    await Department.save(updatedDepartments);
  }

  static async updateDepartment(corpId?: string): Promise<void> {
    const corpConfigs = getCorpList(corpId);
    const corpIds = corpConfigs.map((config) => config.corpId);
    const existDepartments = await Department.find({
      where: { is_exist: true, corp_id: In(corpIds) },
    });
    let result: Department[] = [];

    for (const config of corpConfigs) {
      const departmentList = await contactApiClient.getDepartmentList(
        config.corpId
      );
      const corpDepartments = departmentList["department"].map(
        (department: any) => {
          return {
            corp_id: config.corpId,
            department_id: department.id.toString(),
            parent_id: department.parentid.toString(),
            name: department.name,
            department_leader: department.department_leader,
            is_exist: true,
          } as Department;
        }
      );
      result = result.concat(corpDepartments);

      await Department.upsert(corpDepartments, {
        conflictPaths: ["department_id", "corp_id"],
        skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
      });
    }

    const activeIds = result.map(
      (department) => `${department.corp_id}:${department.department_id}`
    );

    existDepartments
      .filter(
        (department) =>
          !activeIds.includes(`${department.corp_id}:${department.department_id}`)
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
          corp_id: defaultWechatCorpConfig.corpId,
        };
      });
    await Department.upsert(xftOrg, {
      conflictPaths: ["department_id", "corp_id"],
      skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
    });
  }
}
