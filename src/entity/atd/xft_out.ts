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
import { Department } from "../basic/department";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
@Entity("atd_xft_out")
export class XftAtdOut extends BaseEntity {
  @PrimaryColumn()
  serialNumber: number;

  @Column({ nullable: true })
  staffSeq: string;
  @Column({ nullable: true })
  userId: string;
  @Column({ nullable: true })
  userName: string;
  @Column({ nullable: true })
  departmentId: string;
  @Column()
  orgName: string;
  @Column()
  beginTime: Date;
  @Column()
  endTime: Date;
  @Column("interval", { nullable: true })
  duration: number;
  @Column({ nullable: true })
  leaveReason: string;
  @Column({ nullable: true })
  recSts: string;
  @Column({ nullable: true })
  passTime: Date;
  @Column()
  dataSource: string;
  @Column({ nullable: true })
  revokeStatus: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord(record) {
    let weekdays = 0;
    try {
      weekdays = record.leaveDtlDtos.filter(
        (dtos) => dtos["weekDay"] >= 2 && dtos["weekDay"] <= 6
      ).length;
    } catch (error) {}
    const leave = {
      ...record,
      leaveRecSeq: parseInt(record.leaveRecSeq),
      begDate: getDate(record.begDate, record.begTime, true),
      endDate: getDate(record.endDate, record.endTime, false),
      duration: getDuration(record.leaveDuration, record.lveUnit),
      userId: (await User.findOne({ where: { xft_id: record.stfSeq } }))
        ?.user_id,
      departmentId: (
        await Department.findOne({ where: { xft_id: record.orgSeq } })
      )?.department_id,
      weekdays,
    };
    // await XftAtdLeave.create(leave).save();
  }
}

const getDate = (date: string, time: string, begin: boolean) => {
  if (time == "AM" && begin) {
    return new Date(date + "T00:00:00");
  } else if (time == "AM" && !begin) {
    return new Date(date + "T11:59:59");
  } else if (time == "PM" && begin) {
    return new Date(date + "T12:00:00");
  } else if (time == "PM" && !begin) {
    return new Date(date + "T23:59:00");
  }
  return new Date(date + "T" + time);
};

const getDuration = (duration: string, unit: string) => {
  if (unit == "DAY") {
    return parseFloat(duration) * 24 * 60 * 60;
  }
  return parseFloat(duration) * 60 * 60;
};
