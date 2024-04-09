import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";

@Entity()
export class User extends BaseEntity {
  @PrimaryColumn()
  user_id: string;
  @Column({ nullable: true })
  is_employed: boolean;
  @Column({ nullable: true })
  name: string;
  //   @Column({ nullable: true, array: true })
  //   department_id: number[];
  @Column({ nullable: true })
  attendance: string;

  static async insertOrUpdateUsers(users: User[]): Promise<void> {
    try {
      // 1. 找出数据库中所有 is_employed 为 true 的用户
      const employedUsers = await User.find({ where: { is_employed: true } });

      // 2. 更新数据库中 is_employed 为 true 的用户，但不在传入的 users 数组中的用户的状态为 false
      employedUsers
        .filter(
          (dbUser) => !users.some((user) => user.user_id === dbUser.user_id)
        )
        .forEach((dbUser) => {
          dbUser.is_employed = false;
        });

      // 3. 插入 users 数组中存在但数据库中不存在的用户
      const newUsers = users.filter(
        (user) =>
          !employedUsers.some((dbUser) => dbUser.user_id === user.user_id)
      );

      // 4. 保存更新后的用户信息和新用户
      await User.save([...employedUsers, ...newUsers]);

      logger.info("Users inserted or updated successfully.");
    } catch (error) {
      // 处理错误
      logger.error("Error inserting or updating users:", error);
      throw error;
    }
  }
}
