import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Between,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../basic/employee.js";
import { Department } from "../basic/department.js";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
@Entity("atd_xft_leave")
export class XftAtdLeave extends BaseEntity {
  @PrimaryColumn()
  leaveRecSeq: number;

  @Column({ nullable: true })
  stfSeq: string;
  @Column({ nullable: true })
  stfName: string;
  @Column({ nullable: true })
  userId: string;
  @Column({ nullable: true })
  userName: string;
  @Column({ nullable: true })
  userNumber: string;
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
    await XftAtdLeave.upsert(XftAtdLeave.create(leave), {
      conflictPaths: ["leaveRecSeq"],
    });
  }

  static getUsersInRange = async (startDate: Date, endDate: Date) => {
    // 将 GMT+8 转换为 UTC
    const startUtc = fromZonedTime(startDate, "UTC");
    const endUtc = fromZonedTime(endDate, "UTC");
    return (
      await XftAtdLeave.find({
        where: {
          begDate: Between(startDate, endDate),
        },
        select: ["userId"],
      })
    ).map((user) => user.userId);
  };
  static async maxLeaveRecSeq() {
    return (
      await XftAtdLeave.createQueryBuilder("leave")
        .select("MAX(leave.leaveRecSeq)", "maxLeaveRecSeq") // 选择 leaveRecSeq 的最大值
        .getRawOne()
    )?.["maxLeaveRecSeq"];
  }

  static async countMonthlyWeekdaySingleDayOff(
    stfSeq: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRecSeq?: number
  ) {
    const query = XftAtdLeave.createQueryBuilder("leave")
      .where("leave.stfSeq = :stfSeq", { stfSeq })
      .andWhere("leave.lveTypeName = :lveTypeName", { lveTypeName: "轮休假" })
      .andWhere("leave.weekdays > 0")
      .andWhere("leave.begDate <= :endDate", { endDate })
      .andWhere("leave.endDate >= :startDate", { startDate })
      .andWhere("(leave.rvkSts IS NULL OR leave.rvkSts = '')")
      .andWhere("(leave.approveSts IS NULL OR leave.approveSts NOT LIKE :rejectStatus)", {
        rejectStatus: "%驳回%",
      });

    if (excludeLeaveRecSeq) {
      query.andWhere("leave.leaveRecSeq != :excludeLeaveRecSeq", {
        excludeLeaveRecSeq,
      });
    }

    return query.getCount();
  }

  static async countDepartmentLeaveUsersByDay(
    departmentId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRecSeq?: number
  ) {
    const query = XftAtdLeave.createQueryBuilder("leave")
      .select("COUNT(DISTINCT leave.stfSeq)", "count")
      .where("leave.departmentId = :departmentId", { departmentId })
      .andWhere("leave.begDate <= :endDate", { endDate })
      .andWhere("leave.endDate >= :startDate", { startDate })
      .andWhere("(leave.rvkSts IS NULL OR leave.rvkSts = '')")
      .andWhere(
        "(leave.approveSts IS NULL OR leave.approveSts NOT LIKE :rejectStatus)",
        {
          rejectStatus: "%驳回%",
        }
      );

    if (excludeLeaveRecSeq) {
      query.andWhere("leave.leaveRecSeq != :excludeLeaveRecSeq", {
        excludeLeaveRecSeq,
      });
    }

    const result = await query.getRawOne();
    return Number(result?.count ?? 0);
  }

  static async countDepartmentLeaveUsersByDates(
    departmentId: string,
    leaveDays: Date[],
    excludeLeaveRecSeq?: number
  ): Promise<Map<string, number>> {
    const uniqueDays = [...new Set(leaveDays.map((day) => dayKey(day)))].sort();
    const counts = new Map(uniqueDays.map((day) => [day, 0]));
    if (uniqueDays.length === 0) return counts;

    const rangeStart = startOfLocalDay(new Date(`${uniqueDays[0]}T00:00:00`));
    const rangeEnd = endOfLocalDay(
      new Date(`${uniqueDays[uniqueDays.length - 1]}T00:00:00`)
    );
    const query = XftAtdLeave.createQueryBuilder("leave")
      .where("leave.departmentId = :departmentId", { departmentId })
      .andWhere("leave.begDate <= :rangeEnd", { rangeEnd })
      .andWhere("leave.endDate >= :rangeStart", { rangeStart })
      .andWhere("(leave.rvkSts IS NULL OR leave.rvkSts = '')")
      .andWhere(
        "(leave.approveSts IS NULL OR leave.approveSts NOT LIKE :rejectStatus)",
        {
          rejectStatus: "%驳回%",
        }
      );

    if (excludeLeaveRecSeq) {
      query.andWhere("leave.leaveRecSeq != :excludeLeaveRecSeq", {
        excludeLeaveRecSeq,
      });
    }

    const rows = await query.getMany();
    const usersByDay = new Map(uniqueDays.map((day) => [day, new Set<string>()]));
    for (const row of rows) {
      for (const day of uniqueDays) {
        const start = startOfLocalDay(new Date(`${day}T00:00:00`));
        const end = endOfLocalDay(start);
        if (row.begDate <= end && row.endDate >= start && row.stfSeq) {
          usersByDay.get(day)?.add(row.stfSeq);
        }
      }
    }

    for (const [day, users] of usersByDay) {
      counts.set(day, users.size);
    }
    return counts;
  }

  static async withLeaveRuleLocks<T>(
    lockKeys: string[],
    callback: () => Promise<T>
  ): Promise<T> {
    const uniqueKeys = [...new Set(lockKeys.filter(Boolean))].sort();
    if (uniqueKeys.length === 0) {
      return callback();
    }

    const queryRunner = XftAtdLeave.getRepository()
      .manager.connection.createQueryRunner();
    await queryRunner.connect();
    const lockedKeys: string[] = [];
    try {
      for (const key of uniqueKeys) {
        await queryRunner.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
        lockedKeys.push(key);
      }
      return await callback();
    } finally {
      for (const key of lockedKeys.reverse()) {
        await queryRunner.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
      }
      await queryRunner.release();
    }
  }
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

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
