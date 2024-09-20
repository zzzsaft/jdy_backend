import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../wechat/User";
import { Department } from "../wechat/Department";

@Entity("xft_atd_leave")
export class XftAtdLeave extends BaseEntity {
  @PrimaryColumn()
  leaveRecSeq: string;

  @Column({ nullable: true })
  stfSeq: string;
  @Column({ nullable: true })
  stfName: string;
  @Column({ nullable: true })
  userId: string;
  @Column({ nullable: true })
  departmentId: string;
  @Column()
  orgSeq: string;
  @Column()
  orgName: string;
  @Column()
  weekdays: number;
  @Column()
  lveTypeName: string;
  @Column()
  begDate: Date;
  @Column()
  endDate: Date;
  @Column("interval", { nullable: true })
  duration: number;
  @Column({ nullable: true })
  leaveReason: string;
  @Column({ nullable: true })
  recSts: string;
  @Column({ nullable: true })
  passTime: Date;
  @Column()
  approveSts: string;
  @Column({ nullable: true })
  rvkSts: string;
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
    await XftAtdLeave.create(leave).save();
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
