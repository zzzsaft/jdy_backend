import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

// @Entity({ name: "attendance" })
export class Attendance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // 姓名

  @Column({ name: "user_id" })
  userid: string; // 员工号

  @Column()
  attendanceGroup: string; // 考勤组

  @Column()
  departmentNumber: string; // 部门号

  @Column({ type: "date" })
  date: Date; // 日期

  @Column()
  weekDay: string; // 星期

  @Column()
  shift: string; // 班次

  @Column()
  workLocation: string; // 上班地点

  @Column()
  type: string; // 类型

  @Column({ type: "date", nullable: true })
  regularizationDate: Date; // 转正日期

  @Column()
  firstCard: string; // 最早卡

  @Column()
  lastCard: string; // 最晚卡

  @Column({ type: "time", nullable: true })
  checkInTime1: string; // 上班1打卡时间

  @Column()
  checkInResult1: string; // 上班1打卡结果

  @Column({ type: "time", nullable: true })
  checkOutTime1: string; // 下班1打卡时间

  @Column()
  checkOutResult1: string; // 下班1打卡结果

  @Column({ type: "time", nullable: true })
  checkInTime2: string; // 上班2打卡时间

  @Column()
  checkInResult2: string; // 上班2打卡结果

  @Column({ type: "time", nullable: true })
  checkOutTime2: string; // 下班2打卡时间

  @Column()
  checkOutResult2: string; // 下班2打卡结果

  @Column({ type: "time", nullable: true })
  checkInTime3: string; // 上班3打卡时间

  @Column()
  checkInResult3: string; // 上班3打卡结果

  @Column({ type: "time", nullable: true })
  checkOutTime3: string; // 下班3打卡时间

  @Column()
  checkOutResult3: string; // 下班3打卡结果

  @Column()
  attendanceDays: number; // 出勤天数

  @Column({ type: "float" })
  expectedAttendanceHours: number; // 应出勤时长

  @Column({ type: "float" })
  actualAttendanceHours: number; // 实际出勤时长

  @Column({ type: "float" })
  lateDuration: number; // 迟到时长

  @Column()
  lateCount: number; // 迟到次数

  @Column({ type: "float" })
  earlyLeaveDuration: number; // 早退时长

  @Column()
  earlyLeaveCount: number; // 早退次数

  @Column()
  compensatoryLeaveCount: number; // 补卡次数

  @Column()
  restDays: number; // 休息天数

  @Column()
  seriousLateCount: number; // 严重迟到次数

  @Column({ type: "float" })
  seriousLateDuration: number; // 严重迟到时长

  @Column()
  absenteeismLateCount: number; // 旷工迟到次数

  @Column()
  missingCheckInCount: number; // 上班缺卡次数

  @Column()
  missingCheckOutCount: number; // 下班缺卡次数

  @Column()
  externalCheckInCount: number; // 外勤打卡次数

  @Column()
  absenteeismDays: number; // 旷工天数

  @Column()
  businessTripDays: number; // 出差天数

  @Column({ type: "float" })
  offDutyDuration: number; // 外出时长

  @Column()
  mealSubsidyEligibility: number; // 餐补资格

  @Column({ type: "float" })
  absenteeismDuration: number; // 缺勤时长

  @Column()
  weekdayOvertime: number; // 工作日加班

  @Column()
  restDayOvertime: number; // 休息日加班

  @Column()
  holidayOvertime: number; // 节假日加班

  @Column({ type: "float" })
  annualLeaveDuration: number; // 年假时长

  @Column({ type: "float" })
  personalLeaveDuration: number; // 事假时长

  @Column({ type: "float" })
  shortTermSickLeaveDuration: number; // 短期病假时长

  @Column({ type: "float" })
  marriageLeaveDuration: number; // 婚假时长

  @Column({ type: "float" })
  compensatoryLeaveDuration: number; // 调休假时长

  @Column({ type: "float" })
  bereavementLeaveDuration: number; // 丧假时长

  @Column({ type: "float" })
  maternityLeaveDuration: number; // 产假时长

  @Column({ type: "float" })
  paternityLeaveDuration: number; // 陪产假时长

  @Column({ type: "float" })
  prenatalCheckLeaveDuration: number; // 产检假时长

  @Column({ type: "float" })
  miscarriageLeaveDuration: number; // 流产假时长

  @Column({ type: "float" })
  familyLeaveDuration: number; // 探亲假时长

  @Column({ type: "float" })
  nonAttendanceLeaveDuration: number; // 非出勤假时长

  @Column({ type: "float" })
  breastfeedingLeaveDuration: number; // 哺乳假时长

  @Column({ type: "float" })
  breastfeedingDuration: number; // 哺乳时间

  @Column({ type: "float" })
  combinedBreastfeedingDuration: number; // 合并哺乳时间

  @Column({ type: "float" })
  childcareLeaveDuration: number; // 育儿假时长

  @Column({ type: "float" })
  annualLeave: number; // 年假

  @Column({ type: "float" })
  personalLeave: number; // 事假

  @Column({ type: "float" })
  shortTermSickLeave: number; // 短期病假

  @Column({ type: "float" })
  marriageLeave: number; // 婚假

  @Column({ type: "float" })
  compensatoryLeave: number; // 调休假

  @Column({ type: "float" })
  bereavementLeave: number; // 丧假

  @Column({ type: "float" })
  maternityLeave: number; // 产假

  @Column({ type: "float" })
  paternityLeave: number; // 陪产假

  @Column({ type: "float" })
  prenatalCheckLeave: number; // 产检假

  @Column({ type: "float" })
  miscarriageLeave: number; // 流产假

  @Column({ type: "float" })
  familyLeave: number; // 探亲假

  @Column({ type: "float" })
  nonAttendanceLeave: number; // 非出勤假

  @Column({ type: "float" })
  breastfeedingLeave: number; // 哺乳假

  @Column()
  compensationMethod: string; // 补偿方式

  @Column({ type: "float" })
  overtimeLateDuration: number; // 加班迟到时长

  @Column({ type: "float" })
  overtimeEarlyLeaveDuration: number; // 加班早退时长

  @Column({ type: "float" })
  overtimeAttendanceDuration: number; // 加班出勤时长

  @Column({ type: "float" })
  overtimeAbsenteeismDuration: number; // 加班缺勤时长

  @Column()
  overtimeMissingCheckCount: number; // 加班缺卡次数

  @Column({ type: "float" })
  overtimeLeaveDuration: number; // 加班请假时长

  @CreateDateColumn()
  createdAt: Date; // 创建时间

  @UpdateDateColumn()
  updatedAt: Date; // 更新时间
}
