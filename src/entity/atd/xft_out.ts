import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Between,
  Column,
  CreateDateColumn,
  Entity,
  LessThanOrEqual,
  MoreThanOrEqual,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../basic/employee.js";
import { EntryExistRecords } from "../../features/vehicle/entity/dh_entry_exit_record.js";
import { logger } from "../../config/logger.js";

const toValidDate = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
};

@Entity("atd_xft_out")
export class XftAtdOut extends BaseEntity {
  @PrimaryColumn()
  serialNumber: string;

  @Column({ nullable: true })
  staffSeq: string;
  @Column({ nullable: true })
  userId: string;
  @Column({ nullable: true })
  name: string;
  @Column({ nullable: true })
  departmentId: string;
  @Column({ nullable: true })
  orgName: string;
  @Column()
  beginTime: Date;
  @Column()
  endTime: Date;
  @Column("interval", { nullable: true })
  duration: number;
  @Column({ nullable: true })
  remark: string;
  @Column({ nullable: true })
  informationFlag: string;
  @Column()
  dataSource: string;
  @Column({ nullable: true })
  revokeStatus: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
  @Column()
  oldCteateTime: Date;
  @Column({ nullable: true })
  approveStatus: string;
  @Column({ nullable: true })
  location: string;
  @Column({ nullable: true })
  type: string;

  static async addRecord(record) {
    if (!record) return;
    let user = await User.findOne({ where: { xft_id: record.staffSeq } });
    if (!user) {
      console.log(`User not found. stfSeq: ${record.staffSeq}`);
      return;
    }
    const beginTime = toValidDate(record.beginTime);
    const endTime = toValidDate(record.endTime);
    if (!beginTime || !endTime) {
      logger.error(
        `外出记录缺少有效开始/结束时间，已跳过入库。serialNumber=${
          record.serialNumber
        }, beginTime=${record.beginTime}, endTime=${record.endTime}`
      );
      return;
    }
    const out = {
      ...record,
      userId: user.user_id,
      name: user.name,
      departmentId: user.main_department_id,
      beginTime,
      endTime,
      duration: record.duration * 60,
      oldCteateTime: toValidDate(record.oldCteateTime) ?? new Date(),
    };
    const content: XftAtdOut = XftAtdOut.create(out);
    await XftAtdOut.upsert(content, ["serialNumber"]);
    await EntryExistRecords.setOutId(
      content.beginTime,
      content.endTime,
      content.serialNumber.toString(),
      user.user_id,
      "外出"
    );
  }
}
export const testEntryExitRecord = async () => {
  const data = await XftAtdOut.find();
  for (const content of data) {
    await EntryExistRecords.setOutId(
      content.beginTime,
      content.endTime,
      content.serialNumber.toString(),
      content.userId,
      "外出"
    );
  }
};
