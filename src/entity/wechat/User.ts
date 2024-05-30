import {
  Entity,
  Column,
  BaseEntity,
  PrimaryColumn,
  Like,
  ManyToOne,
} from "typeorm";
import { logger } from "../../config/logger";
import { xftUserApiClient } from "../../utils/xft/xft_user";
import { Department } from "./Department";
import { contactApiClient } from "../../utils/wechat/contact";
import _ from "lodash";

@Entity()
export class User extends BaseEntity {
  @PrimaryColumn()
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
  @Column({ nullable: true, unique: true })
  xft_enterprise_id: string;
  @Column({ nullable: true })
  attendance: string;
  // @ManyToOne(() => Department, (department) => department.)
  department: Department;

  static async updateUser(): Promise<void> {
    const existDepartment = await Department.find({
      where: { is_exist: true },
    });
    const departmentIds = existDepartment.map(
      (department) => department.department_id
    );
    const existUserIds = await User.find({ where: { is_employed: true } });
    let result: User[] = [];
    for (const departmentId of departmentIds) {
      const userList = await contactApiClient.getUserList(departmentId);
      const users = userList.userlist.map((user) => {
        return {
          user_id: user.userid,
          name: user.name,
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
    existUserIds
      .filter((user) => !result.map((u) => u.user_id).includes(user.user_id))
      .forEach(async (user) => {
        user.is_employed = false;
        await user.save();
      });
  }
  static async getUser_id(xftUserId: string): Promise<string> {
    const user = await User.findOne({
      where: { xft_enterprise_id: xftUserId },
    });
    if (user) {
      return user.user_id;
    } else {
      const userid = (await xftUserApiClient.getEmployeeDetail(xftUserId))[
        "body"
      ]?.["number"];
      if (!userid) {
        throw new Error("User not found.");
      }
      const user = await User.findOne({
        where: { user_id: Like(`%${userid}%`) },
      });
      if (user) {
        user.xft_enterprise_id = xftUserId;
        await user.save();
      }
      return userid;
    }
  }
  static async getXftEnterpriseId(userid: string): Promise<string> {
    const user = await User.findOne({ where: { user_id: userid } });
    return user?.xft_enterprise_id ?? "";
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
}
