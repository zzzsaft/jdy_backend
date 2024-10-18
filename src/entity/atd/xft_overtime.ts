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
import { User } from "../basic/employee";
import { Department } from "../basic/department";

@Entity("atd_xft_overtime")
export class XftAtdOvertime extends BaseEntity {
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
  @Column()
  overtimeType: string;
  @Column()
  begDate: Date;
  @Column()
  endDate: Date;
  @Column({ nullable: true })
  remark: string;
  @Column()
  approveStatus: string;
  @Column({ nullable: true })
  informationFlag: string;
  @Column({ nullable: true })
  revokeStatus: string;
  @Column("interval", { nullable: true })
  overtimeLen: number;
  @Column("interval", { nullable: true })
  overtimeAutoLen: number;
  @Column("interval", { nullable: true })
  overtimeFinalLen: number;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord(record, detail) {
    const exist = await XftAtdOvertime.findOne({
      where: { serialNumber: record.serialNumber },
    });
    if (exist) return;
    let overtimeType = {
      "0": "工作日",
      "1": "休息日",
      "2": "节假日",
    };
    const user = await User.findOne({ where: { xft_id: record.staffSeq } });
    const userId = user?.user_id;
    const stfName = user?.name;
    const departmentId = user?.main_department_id;
    const overtime = {
      ...record,
      ...detail,
      stfSeq: record.staffSeq,
      stfName,
      userId,
      departmentId,
      overtimeType: overtimeType[detail.overtimeType],
      begDate: getDate(record.beginDate, record.beginTime, true),
      endDate: getDate(record.endDate, record.endTime, false),
      overtimeLen: getDuration(detail.overtimeLen, detail.durationUnit),
      overtimeAutoLen: getDuration(detail.overtimeAutoLen, detail.durationUnit),
      overtimeFinalLen: getDuration(
        detail.overtimeFinalLen,
        detail.durationUnit
      ),
    };
    // await XftAtdOvertime.create(overtime).save();
    await XftAtdOvertime.upsert(XftAtdOvertime.create(overtime), {
      conflictPaths: ["serialNumber"],
      skipUpdateIfNoValuesChanged: true,
    });
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
  if (unit == "0") {
    return parseFloat(duration) * 60 * 60;
  }
  return parseFloat(duration) * 60;
};
