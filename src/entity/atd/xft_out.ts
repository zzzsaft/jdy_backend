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
import { User } from "../basic/employee";
import { EntryExistRecords } from "../parking/dh_entry_exit_record";

@Entity("atd_xft_out")
export class XftAtdOut extends BaseEntity {
  @PrimaryColumn()
  serialNumber: number;

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

  static async addRecord(record) {
    if (!record) return;
    let user = await User.findOne({ where: { xft_id: record.staffSeq } });
    if (!user) {
      console.log(`User not found. stfSeq: ${record.staffSeq}`);
      return;
    }
    const out = {
      ...record,
      userId: user.user_id,
      name: user.name,
      departmentId: user.main_department_id,
      beginTime: new Date(record.beginTime),
      endTime: new Date(record.endTime),
      duration: record.duration * 60,
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
