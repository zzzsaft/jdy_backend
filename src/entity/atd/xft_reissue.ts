import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../basic/employee";

@Entity("atd_xft_reissue")
export class XftAtdReissue extends BaseEntity {
  @PrimaryColumn()
  serialNumber: string;

  @Column({ nullable: true })
  stfSeq: string;
  @Column({ nullable: true })
  stfName: string;
  @Column({ nullable: true })
  userId: string;
  @Column({ nullable: true })
  departmentId: string;
  @Column({ nullable: true })
  sponsorName: string;
  @Column({ nullable: true })
  sponsorNbr: string;
  @Column()
  supplementCardType: string;
  @Column()
  datetime: Date;
  @Column()
  useSupplementCardNumber: number;
  @Column()
  publicPrivateType: string;
  @Column({ nullable: true })
  dataSource: string;
  @Column({ nullable: true })
  remark: string;
  @Column()
  approveStatus: string;
  @Column({ nullable: true })
  informationFlag: string;
  @Column({ nullable: true })
  revokeStatus: string;
  @Column({ nullable: true })
  createUser: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord(record) {
    const user = await User.findOne({ where: { xft_id: record.staffSeq } });
    const userId = user?.user_id;
    const stfName = user?.name;
    const departmentId = user?.main_department_id;
    const overtime = {
      ...record,
      stfSeq: record.staffSeq,
      stfName,
      userId,
      departmentId,
      datetime: getDate(record.date, record.time),
    };
    await XftAtdReissue.create(overtime).save();
  }
}

const getDate = (date: string, time: string) => {
  if (time == "AM") {
    return new Date(date + "T00:00:00");
  } else if (time == "PM") {
    return new Date(date + "T12:00:00");
  }
  return new Date(date + "T" + time);
};
