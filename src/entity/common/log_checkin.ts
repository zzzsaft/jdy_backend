import { Entity, Column, PrimaryGeneratedColumn, BaseEntity } from "typeorm";

@Entity({ name: "log_checkin" })
export class LogCheckin extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  StartDate: Date;

  @Column()
  EndDate: Date;

  @Column()
  errmsg: string;

  static async getLastDate() {
    // 获取最晚的 EndDate 对应的记录
    const lastLog = await LogCheckin.find({
      order: {
        EndDate: "DESC",
      },
      take: 1,
    });

    // 返回最晚的 EndDate，如果没有记录，则返回 null
    return lastLog ? lastLog[0].EndDate : new Date("2024-08-31");
  }
}
