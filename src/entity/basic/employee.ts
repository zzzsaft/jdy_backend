import {
  Entity,
  Column,
  BaseEntity,
  PrimaryColumn,
  Like,
  ManyToOne,
  Not,
  IsNull,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { logger } from "../../config/logger";
import { xftUserApiClient } from "../../api/xft/xft_user";
import { Department } from "./department";
import { contactApiClient } from "../../api/wechat/contact";
import _ from "lodash";
import { jctimesApiClient } from "../../api/jctimes/app";

@Entity({ name: "md_employee" })
export class User extends BaseEntity {
  @PrimaryColumn({ name: "user_id" })
  user_id: string;
  @Column({ nullable: true })
  xft_id: string;
  @Column({ nullable: true })
  is_employed: boolean;
  @Column({ nullable: true })
  name: string;
  @Column("simple-array", { nullable: true })
  department_id: string[];
  @Column({ nullable: true })
  main_department_id: string;
  @Column({ nullable: true })
  xft_enterprise_id: string;
  @Column({ nullable: true })
  attendance: string;
  @Column({ nullable: true })
  dahua_id: string;
  @Column({ nullable: true })
  mobile: string;
  @Column({ name: "fbt_id", nullable: true })
  fbtId: string;
  @Column({ name: "fbt_phone", nullable: true })
  fbtPhone: string;
  @Column({ name: "fbt_third_id", nullable: true })
  fbtThirdId: string;
  @Column({ nullable: true })
  leader: string;
  @Column({ nullable: true, name: "photo_name" })
  photoName: string;
  @Column({ nullable: true, name: "wx_face" })
  wxFace: boolean;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
  // @ManyToOne(() => Department, (department) => department.)
  department: Department;

  static async updateUser(): Promise<void> {
    const existDepartment = await Department.find({
      where: { is_exist: true },
    });
    const departmentIds = existDepartment.map(
      (department) => department.department_id
    );
    const existUserIds = await User.find({
      where: [{ is_employed: true }, { is_employed: IsNull() }],
    });
    let result: User[] = [];
    // const userList = await jctimesApiClient.getUserLists();
    for (const departmentId of departmentIds) {
      const userList = await contactApiClient.getUserList(departmentId);
      const users = userList.userlist.map((user) => {
        return {
          user_id: user.userid,
          // name: user.name,
          is_employed: true,
          department_id: user.department,
          main_department_id: user.main_department,
        };
      });
      result = result.concat(users);
      await User.upsert(users, {
        conflictPaths: ["user_id"],
        skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
      });
    }

    const leavedEmployee = existUserIds.filter(
      (user) => !result.map((u) => u.user_id).includes(user.user_id)
    );
    for (const user of leavedEmployee) {
      user.is_employed = false;
      await user.save();
    }
  }

  static async getUser_id(xft_enterprise_id: string): Promise<string> {
    const user = await User.findOne({
      where: { xft_enterprise_id, is_employed: true },
    });
    if (user) {
      return user.user_id;
    } else {
      const userid = (
        await xftUserApiClient.getEmployeeDetail(xft_enterprise_id)
      )["body"]?.["number"];
      if (!userid) {
        throw new Error(`User not found.${xft_enterprise_id}`);
      }
      const user = await User.findOne({
        where: { user_id: Like(`%${userid}%`) },
      });
      if (user) {
        user.xft_enterprise_id = xft_enterprise_id;
        await user.save();
      }
      return userid;
    }
  }
  static async getXftEnterpriseId(userid: string): Promise<string> {
    const user = await User.findOne({ where: { user_id: userid } });
    return user?.xft_enterprise_id ?? "";
  }
  static async getXftId(userid: string): Promise<string> {
    const user = await User.findOne({ where: { user_id: userid } });
    return user?.xft_id ?? "";
  }

  static async updateXftId(): Promise<void> {
    const xftUsers = (await xftUserApiClient.getMemberList())["OPUSRLSTY"]
      .map((user) => {
        return {
          user_id: user["STFNBR"],
          xft_id: user["STFSEQ"],
          xft_enterprise_id: user["USRNBR"],
        };
      })
      .filter((user) => user.user_id);
    const user = _.uniqBy(xftUsers, "user_id") as any;
    await User.upsert(user, {
      conflictPaths: ["user_id"],
      skipUpdateIfNoValuesChanged: true, // supported by postgres, skips update if it would not change row values
    });
  }

  static async addDahuaId(userId: string, dahuaId: string) {
    const user = await User.findOne({ where: { user_id: userId } });
    if (user) {
      user.dahua_id = dahuaId;
      await user.save();
    } else {
      logger.error(`User not found: ${userId}`);
    }
  }

  static async getLeaderId(userId: string): Promise<string[]> {
    // 通过左连接同时查询 User 和 Department 信息，避免多次查询
    const userWithDepartment = await User.createQueryBuilder("user")
      .leftJoinAndSelect(
        "md_department",
        "org",
        "user.main_department_id = org.department_id"
      ) // 假设 User 表有 department_id 字段
      .leftJoinAndSelect(
        "md_department",
        "parent_org",
        "org.parent_id = parent_org.department_id"
      ) // 左连接获取 MdDepartment 表
      .where("user.user_id = :userId", { userId })
      .select([
        "user.leader",
        "org.department_leader", // 当前部门领导
        "parent_org.department_leader", // 父部门领导
      ])
      .getRawOne();

    if (!userWithDepartment) {
      return [];
    }

    // 如果用户有直接的 leader，返回
    if (userWithDepartment.user_leader) {
      const directLeader = userWithDepartment.user_leader?.split(",");
      return directLeader ? directLeader : [];
    }

    const leader = userWithDepartment.org_department_leader?.split(",");

    // 如果该用户自己是部门领导，则查找父部门的领导
    if (leader?.includes(userId)) {
      const parentLeader =
        userWithDepartment.parent_org_department_leader?.split(",");
      return parentLeader ? parentLeader : [];
    }
    if (leader) {
      return leader;
    }

    // 如果没有直接领导，返回空数组
    return [];
  }

  static async getOrg(userId: string): Promise<Department | null> {
    const orgid = (
      await User.findOne({
        where: { user_id: userId },
        select: ["main_department_id"],
      })
    )?.main_department_id;
    if (orgid) {
      return await Department.findOne({ where: { department_id: orgid } });
    }
    return null;
  }
}
