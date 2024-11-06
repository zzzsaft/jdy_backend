import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  BaseEntity,
} from "typeorm";
import { mergeDateAndTime } from "../../utils/dateUtils";

@Entity({ name: "atd_day_result" })
export class AtdDayResult extends BaseEntity {
  @PrimaryColumn({ name: "date", type: "date", comment: "日期" })
  date: Date; // 日期

  @PrimaryColumn({ name: "user_id", comment: "员工号" })
  userId: string; // 员工号

  @Column({ name: "employee_name", nullable: true, comment: "姓名" })
  name: string; // 姓名

  @Column({ name: "attendance_group", nullable: true, comment: "考勤组" })
  attendanceGroup: string; // 考勤组

  @Column({ name: "business_group", nullable: true, comment: "业务分组" })
  businessGroup: string; // 业务分组

  @Column({ name: "department_id", nullable: true, comment: "部门号" })
  departmentId: string; // 部门号

  @Column({ name: "week_day", nullable: true, comment: "星期" })
  weekDay: string; // 星期

  @Column({ name: "shift", nullable: true, comment: "班次" })
  shift: string; // 班次

  @Column({ name: "work_location", nullable: true, comment: "上班地点" })
  workLocation: string; // 上班地点

  @Column({ name: "type", nullable: true, comment: "类型" })
  type: string; // 类型

  @Column({
    type: "timestamptz",
    name: "earliest_card",
    nullable: true,
    comment: "最早卡",
  })
  earliestCard: Date | null; // 最早卡

  @Column({
    type: "timestamptz",
    name: "latest_card",
    nullable: true,
    comment: "最晚卡",
  })
  latestCard: Date | null; // 最晚卡
  @Column({
    name: "all_card",
    nullable: true,
    comment: "全卡",
  })
  allCard: string; // 全卡
  @Column({
    type: "timestamptz",
    name: "checkin_time_1",
    nullable: true,
    comment: "上班1打卡时间",
  })
  checkinTime1: Date | null; // 上班1打卡时间

  @Column({
    name: "checkin_result_1",
    nullable: true,
    comment: "上班1打卡结果",
  })
  checkinResult1: string; // 上班1打卡结果

  @Column({
    type: "timestamptz",
    name: "checkout_time_1",
    nullable: true,
    comment: "下班1打卡时间",
  })
  checkoutTime1: Date | null; // 下班1打卡时间

  @Column({
    name: "checkout_result_1",
    nullable: true,
    comment: "下班1打卡结果",
  })
  checkoutResult1: string; // 下班1打卡结果

  // 以下为上班2、下班2、上班3、下班3的打卡时间及结果
  @Column({
    type: "timestamptz",
    name: "checkin_time_2",
    nullable: true,
    comment: "上班2打卡时间",
  })
  checkinTime2: Date | null;

  @Column({
    name: "checkin_result_2",
    nullable: true,
    comment: "上班2打卡结果",
  })
  checkinResult2: string;

  @Column({
    type: "timestamptz",
    name: "checkout_time_2",
    nullable: true,
    comment: "下班2打卡时间",
  })
  checkoutTime2: Date | null;

  @Column({
    name: "checkout_result_2",
    nullable: true,
    comment: "下班2打卡结果",
  })
  checkoutResult2: string;

  @Column({
    type: "timestamptz",
    name: "checkin_time_3",
    nullable: true,
    comment: "上班3打卡时间",
  })
  checkinTime3: Date | null;

  @Column({
    name: "checkin_result_3",
    nullable: true,
    comment: "上班3打卡结果",
  })
  checkinResult3: string;

  @Column({
    type: "timestamptz",
    name: "checkout_time_3",
    nullable: true,
    comment: "下班3打卡时间",
  })
  checkoutTime3: Date | null;

  @Column({
    name: "checkout_result_3",
    nullable: true,
    comment: "下班3打卡结果",
  })
  checkoutResult3: string;

  @Column({
    name: "attendance_days",
    nullable: true,
    comment: "出勤天数",
    type: "decimal",
    scale: 2,
  })
  attendanceDays: number; // 出勤天数

  @Column({
    name: "scheduled_hours",
    nullable: true,
    comment: "应出勤时长",
    type: "decimal",
    scale: 2,
  })
  scheduledHours: number; // 应出勤时长

  @Column({
    name: "actual_hours",
    nullable: true,
    comment: "实际出勤时长",
    type: "decimal",
    scale: 2,
  })
  actualHours: number; // 实际出勤时长

  @Column({
    name: "late_duration",
    nullable: true,
    comment: "迟到时长",
    type: "decimal",
    scale: 2,
  })
  lateDuration: number; // 迟到时长

  @Column({
    name: "late_count",
    nullable: true,
    comment: "迟到次数",
    type: "decimal",
    scale: 2,
  })
  lateCount: number; // 迟到次数

  @Column({
    name: "early_leave_duration",
    nullable: true,
    comment: "早退时长",
    type: "decimal",
    scale: 2,
  })
  earlyLeaveDuration: number; // 早退时长

  @Column({
    name: "early_leave_count",
    nullable: true,
    comment: "早退次数",
    type: "decimal",
    scale: 2,
  })
  earlyLeaveCount: number; // 早退次数

  @Column({
    name: "makeup_card_count",
    nullable: true,
    comment: "补卡次数",
    type: "decimal",
    scale: 2,
  })
  makeupCardCount: number; // 补卡次数

  @Column({
    name: "rest_days",
    nullable: true,
    comment: "休息天数",
    type: "decimal",
    scale: 2,
  })
  restDays: number; // 休息天数

  @Column({
    name: "serious_late_count",
    nullable: true,
    comment: "严重迟到次数",
    type: "decimal",
    scale: 2,
  })
  seriousLateCount: number; // 严重迟到次数

  @Column({
    name: "serious_late_duration",
    nullable: true,
    comment: "严重迟到时长",
    type: "decimal",
    scale: 2,
  })
  seriousLateDuration: number; // 严重迟到时长

  @Column({
    name: "absence_late_count",
    nullable: true,
    comment: "旷工迟到次数",
    type: "decimal",
    scale: 2,
  })
  absenceLateCount: number; // 旷工迟到次数

  @Column({
    name: "missing_card_count_checkin",
    nullable: true,
    comment: "上班缺卡次数",
    type: "decimal",
    scale: 2,
  })
  missingCardCountCheckin: number; // 上班缺卡次数

  @Column({
    name: "missing_card_count_checkout",
    nullable: true,
    comment: "下班缺卡次数",
    type: "decimal",
    scale: 2,
  })
  missingCardCountCheckout: number; // 下班缺卡次数

  @Column({
    name: "outdoor_checkin_count",
    nullable: true,
    comment: "外勤打卡次数",
    type: "decimal",
    scale: 2,
  })
  outdoorCheckinCount: number; // 外勤打卡次数

  @Column({
    name: "absent_days",
    nullable: true,
    comment: "旷工天数",
    type: "decimal",
    scale: 2,
  })
  absentDays: number; // 旷工天数

  @Column({
    name: "business_trip_days",
    nullable: true,
    comment: "出差天数",
    type: "decimal",
    scale: 2,
  })
  businessTripDays: number; // 出差天数

  @Column({
    name: "out_duration",
    nullable: true,
    comment: "外出时长",
    type: "decimal",
    scale: 2,
  })
  outDuration: number; // 外出时长

  @Column({
    name: "meal_allowance_qualification",
    nullable: true,
    comment: "餐补资格",
    type: "decimal",
    scale: 2,
  })
  mealAllowanceQualification: number; // 餐补资格

  @Column({
    name: "absence_duration",
    nullable: true,
    comment: "缺勤时长",
    type: "decimal",
    scale: 2,
  })
  absenceDuration: number; // 缺勤时长

  // 加班相关字段
  @Column({
    name: "weekday_overtime",
    nullable: true,
    comment: "工作日加班",
    type: "decimal",
    scale: 2,
  })
  weekdayOvertime: number; // 工作日加班

  @Column({
    name: "restday_overtime",
    nullable: true,
    comment: "休息日加班",
    type: "decimal",
    scale: 2,
  })
  restdayOvertime: number; // 休息日加班

  @Column({
    name: "holiday_overtime",
    nullable: true,
    comment: "节假日加班",
    type: "decimal",
    scale: 2,
  })
  holidayOvertime: number; // 节假日加班

  @Column({
    name: "annual_leave_duration",
    nullable: true,
    comment: "年假时长",
    type: "decimal",
    scale: 2,
  })
  annualLeaveDuration: number; // 年假时长

  // 各类假期时长
  @Column({
    name: "personal_leave_duration",
    nullable: true,
    comment: "事假时长",
    type: "decimal",
    scale: 2,
  })
  personalLeaveDuration: number; // 事假时长

  @Column({
    name: "short_term_sick_leave_duration",
    nullable: true,
    comment: "短期病假时长",
    type: "decimal",
    scale: 2,
  })
  shortTermSickLeaveDuration: number; // 短期病假时长

  @Column({
    name: "marriage_leave_duration",
    nullable: true,
    comment: "婚假时长",
    type: "decimal",
    scale: 2,
  })
  marriageLeaveDuration: number; // 婚假时长

  @Column({
    name: "compensatory_leave_duration",
    nullable: true,
    comment: "调休假时长",
    type: "decimal",
    scale: 2,
  })
  compensatoryLeaveDuration: number; // 调休假时长

  @Column({
    name: "bereavement_leave_duration",
    nullable: true,
    comment: "丧假时长",
    type: "decimal",
    scale: 2,
  })
  bereavementLeaveDuration: number; // 丧假时长

  @Column({
    name: "maternity_leave_duration",
    nullable: true,
    type: "decimal",
    comment: "产假时长",
    scale: 2,
  })
  maternityLeaveDuration: number; // 产假时长

  @Column({
    name: "paternity_leave_duration",
    nullable: true,
    comment: "陪产假时长",
    type: "decimal",
    scale: 2,
  })
  paternityLeaveDuration: number; // 陪产假时长

  @Column({
    name: "pregnancy_check_leave_duration",
    nullable: true,
    comment: "产检假时长",
    type: "decimal",
    scale: 2,
  })
  pregnancyCheckLeaveDuration: number; // 产检假时长

  @Column({
    name: "miscarriage_leave_duration",
    nullable: true,
    comment: "流产假时长",
    type: "decimal",
    scale: 2,
  })
  miscarriageLeaveDuration: number; // 流产假时长

  @Column({
    name: "family_visit_leave_duration",
    nullable: true,
    comment: "探亲假时长",
    type: "decimal",
    scale: 2,
  })
  familyVisitLeaveDuration: number; // 探亲假时长

  @Column({
    name: "non_attendance_leave_duration",
    nullable: true,
    comment: "非出勤假时长",
    type: "decimal",
    scale: 2,
  })
  nonAttendanceLeaveDuration: number; // 非出勤假时长

  @Column({
    name: "breastfeeding_leave_duration",
    nullable: true,
    comment: "哺乳假时长",
    type: "decimal",
    scale: 2,
  })
  breastfeedingLeaveDuration: number; // 哺乳假时长

  @Column({
    name: "breastfeeding_time",
    nullable: true,
    comment: "哺乳时间",
    type: "decimal",
    scale: 2,
  })
  breastfeedingTime: number; // 哺乳时间

  @Column({
    name: "combined_breastfeeding_time",
    nullable: true,
    comment: "合并哺乳时间",
    type: "decimal",
    scale: 2,
  })
  combinedBreastfeedingTime: number; // 合并哺乳时间

  @Column({
    name: "parental_leave_duration",
    nullable: true,
    comment: "育儿假时长",
    type: "decimal",
    scale: 2,
  })
  parentalLeaveDuration: number; // 育儿假时长

  @Column({
    name: "annual_leave",
    nullable: true,
    comment: "年假",
    type: "decimal",
    scale: 2,
  })
  annualLeave: number; // 年假

  @Column({
    name: "personal_leave",
    nullable: true,
    comment: "事假",
    type: "decimal",
    scale: 2,
  })
  personalLeave: number; // 事假

  @Column({
    name: "short_term_sick_leave",
    nullable: true,
    comment: "短期病假",
    type: "decimal",
    scale: 2,
  })
  shortTermSickLeave: number; // 短期病假

  @Column({
    name: "marriage_leave",
    nullable: true,
    comment: "婚假",
    type: "decimal",
    scale: 2,
  })
  marriageLeave: number; // 婚假

  @Column({
    name: "compensatory_leave",
    nullable: true,
    comment: "调休假",
    type: "decimal",
    scale: 2,
  })
  compensatoryLeave: number; // 调休假

  @Column({
    name: "bereavement_leave",
    nullable: true,
    comment: "丧假",
    type: "decimal",
    scale: 2,
  })
  bereavementLeave: number; // 丧假

  @Column({
    name: "maternity_leave",
    nullable: true,
    comment: "产假",
    type: "decimal",
    scale: 2,
  })
  maternityLeave: number; // 产假

  @Column({
    name: "paternity_leave",
    nullable: true,
    comment: "陪产假",
    type: "decimal",
    scale: 2,
  })
  paternityLeave: number; // 陪产假

  @Column({
    name: "pregnancy_check_leave",
    nullable: true,
    comment: "产检假",
    type: "decimal",
    scale: 2,
  })
  pregnancyCheckLeave: number; // 产检假

  @Column({
    name: "miscarriage_leave",
    nullable: true,
    comment: "流产假",
    type: "decimal",
    scale: 2,
  })
  miscarriageLeave: number; // 流产假

  @Column({
    name: "family_visit_leave",
    nullable: true,
    comment: "探亲假",
    type: "decimal",
    scale: 2,
  })
  familyVisitLeave: number; // 探亲假

  @Column({
    name: "non_attendance_leave",
    nullable: true,
    comment: "非出勤假",
    type: "decimal",
    scale: 2,
  })
  nonAttendanceLeave: number; // 非出勤假

  @Column({
    name: "breastfeeding_leave",
    nullable: true,
    comment: "哺乳假",
    type: "decimal",
    scale: 2,
  })
  breastfeedingLeave: number; // 哺乳假

  @Column({ name: "compensation_method", nullable: true, comment: "补偿方式" })
  compensationMethod: string; // 补偿方式

  @Column({
    name: "overtime_late_duration",
    nullable: true,
    comment: "加班迟到时长",
    type: "decimal",
    scale: 2,
  })
  overtimeLateDuration: number; // 加班迟到时长

  @Column({
    name: "overtime_early_leave_duration",
    nullable: true,
    comment: "加班早退时长",
    type: "decimal",
    scale: 2,
  })
  overtimeEarlyLeaveDuration: number; // 加班早退时长

  @Column({
    name: "overtime_attendance_duration",
    nullable: true,
    comment: "加班出勤时长",
    type: "decimal",
    scale: 2,
  })
  overtimeAttendanceDuration: number; // 加班出勤时长

  @Column({
    name: "overtime_absence_duration",
    nullable: true,
    comment: "加班缺勤时长",
    type: "decimal",
    scale: 2,
  })
  overtimeAbsenceDuration: number; // 加班缺勤时长

  @Column({
    name: "overtime_missing_card_count",
    nullable: true,
    comment: "加班缺卡次数",
    type: "decimal",
    scale: 2,
  })
  overtimeMissingCardCount: number; // 加班缺卡次数

  @Column({
    name: "overtime_leave_duration",
    nullable: true,
    comment: "加班请假时长",
    type: "decimal",
    scale: 2,
  })
  overtimeLeaveDuration: number; // 加班请假时长

  @Column({ nullable: true })
  HLD_CUST16: string; // 未知1

  @Column({ nullable: true })
  HLD_CUST17: string; // 未知1

  @Column({ nullable: true })
  HLD_CUST18: string; // 未知1

  @Column({ nullable: true })
  HLD_CUST19: string; // 未知1

  @Column({ nullable: true })
  HLD_CUST20: string; // 未知1

  @Column({ nullable: true })
  CST_000023: string; // 未知1

  @Column({ nullable: true })
  CST_000026: string; // 未知1

  @Column({ nullable: true })
  CST_000035: string; // 未知1

  @Column({ nullable: true })
  CST_000076: string; // 未知1

  @Column({ nullable: true })
  CST_000082: string; // 未知1

  @Column({ nullable: true })
  CST_000085: string; // 未知1

  @Column({ nullable: true })
  CST_000090: string; // 未知1

  @Column({ nullable: true })
  HOLDT1: string; // 未知1

  @Column({ nullable: true })
  HOLDT2: string; // 未知1

  @Column({ nullable: true })
  RYCQTS: string; // 未知1

  @Column({ nullable: true })
  WORKT1: string; // 未知1

  @Column({ nullable: true })
  WORKT2: string; // 未知1

  @Column({ nullable: true })
  WEEKT1: string; // 未知1

  @Column({ nullable: true })
  WEEKT2: string; // 未知1

  @Column({ nullable: true })
  WKEL10: string; // 未知1

  @Column({ nullable: true })
  WKEL12: string; // 未知1

  @Column({ nullable: true })
  hold1: string; // 未知1
  @Column({ nullable: true })
  hold2: string; // 未知1
  @Column({ nullable: true })
  hold3: string; // 未知1
  @Column({ nullable: true })
  hold4: string; // 未知1
  @Column({ nullable: true })
  hold5: string; // 未知1

  @CreateDateColumn() createdAt: Date; // 创建时间

  @UpdateDateColumn() updatedAt: Date; // 更新时间

  static createAttendanceData(apiData: any) {
    // 创建一个新的 Attendance 实例
    const attendance = AtdDayResult.create({ ...apiData });

    // 映射 API 数据到实体字段
    attendance.attendanceGroup = apiData.GRONAM || null;
    attendance.businessGroup = apiData.BUSGRP || null;
    attendance.allCard = apiData.ALLCLK || null;
    attendance.attendanceGroup = apiData.GRONAM || null;
    attendance.date = new Date(apiData.ATDDAT);
    attendance.weekDay = apiData.DAYWEK || null;
    attendance.shift = apiData.CHANAM || null;
    attendance.workLocation = apiData.WOKLOC || null;
    attendance.type = apiData.RQLX01 || null;

    attendance.earliestCard = mergeDateAndTime(apiData.ATDDAT, apiData.FIRCAR);
    attendance.latestCard = mergeDateAndTime(apiData.ATDDAT, apiData.LSTCAR);

    attendance.checkinTime1 = mergeDateAndTime(apiData.ATDDAT, apiData.CLKONT);
    attendance.checkinResult1 = apiData.ONRES || null;
    attendance.checkoutTime1 = mergeDateAndTime(apiData.ATDDAT, apiData.CLKOFT);
    attendance.checkoutResult1 = apiData.OFFRES || null;
    attendance.checkinTime2 = mergeDateAndTime(apiData.ATDDAT, apiData.CLKONT2);
    attendance.checkinResult2 = apiData.ONRES2 || null;
    attendance.checkoutTime2 = mergeDateAndTime(
      apiData.ATDDAT,
      apiData.CLKOFT2
    );
    attendance.checkoutResult2 = apiData.OFFRES2 || null;
    attendance.checkinTime3 = mergeDateAndTime(apiData.ATDDAT, apiData.CLKONT3);
    attendance.checkinResult3 = apiData.ONRES3 || null;
    attendance.checkoutTime3 = mergeDateAndTime(
      apiData.ATDDAT,
      apiData.CLKOFT3
    );
    attendance.checkoutResult3 = apiData.OFFRES3 || null;
    attendance.attendanceDays = apiData.WRKLT1 ? Number(apiData.WRKLT1) : 0;
    attendance.scheduledHours = apiData.BZCQS1 ? parseFloat(apiData.BZCQS1) : 0;
    attendance.actualHours = apiData.BZCQS2 ? parseFloat(apiData.BZCQS2) : 0;
    attendance.lateDuration = apiData.LATTIM ? parseFloat(apiData.LATTIM) : 0;
    attendance.lateCount = apiData.LAATI0 ? Number(apiData.LAATI0) : 0;
    attendance.earlyLeaveDuration = apiData.EARTIM
      ? parseFloat(apiData.EARTIM)
      : 0;
    attendance.earlyLeaveCount = apiData.EACON1 ? Number(apiData.EACON1) : 0;
    attendance.makeupCardCount = apiData.RBKTIM ? Number(apiData.RBKTIM) : 0;
    attendance.restDays = apiData.DAYJ04 ? Number(apiData.DAYJ04) : 0;
    attendance.seriousLateCount = apiData.LAATI2 ? Number(apiData.LAATI2) : 0;
    attendance.seriousLateDuration = apiData.LAATI3
      ? parseFloat(apiData.LAATI3)
      : 0;
    attendance.absenceLateCount = apiData.LAATI4 ? Number(apiData.LAATI4) : 0;
    attendance.missingCardCountCheckin = apiData.AMADA1
      ? Number(apiData.AMADA1)
      : 0;
    attendance.missingCardCountCheckout = apiData.AMADA2
      ? Number(apiData.AMADA2)
      : 0;
    attendance.outdoorCheckinCount = apiData.CLKT03
      ? Number(apiData.CLKT03)
      : 0;
    attendance.absentDays = apiData.DAYJ05 ? Number(apiData.DAYJ05) : 0;
    attendance.businessTripDays = apiData.TRPDA2 ? Number(apiData.TRPDA2) : 0;
    attendance.outDuration = apiData.GOTLTH ? parseFloat(apiData.GOTLTH) : 0;
    attendance.mealAllowanceQualification = apiData.RCBZG
      ? Number(apiData.RCBZG)
      : 0;
    attendance.absenceDuration = apiData.RQQSC ? parseFloat(apiData.RQQSC) : 0;
    attendance.weekdayOvertime = apiData.DAYJ01 ? Number(apiData.DAYJ01) : 0;
    attendance.restdayOvertime = apiData.DAYJ02 ? Number(apiData.DAYJ02) : 0;
    attendance.holidayOvertime = apiData.DAYJ03 ? Number(apiData.DAYJ03) : 0;
    attendance.annualLeaveDuration = apiData.ANNUALD
      ? parseFloat(apiData.ANNUALD)
      : 0;
    attendance.personalLeaveDuration = apiData.PRIAFFD
      ? parseFloat(apiData.PRIAFFD)
      : 0;
    attendance.shortTermSickLeaveDuration = apiData.SIKAFFD
      ? parseFloat(apiData.SIKAFFD)
      : 0;
    attendance.marriageLeaveDuration = apiData.WEDINGD
      ? parseFloat(apiData.WEDINGD)
      : 0;
    attendance.compensatoryLeaveDuration = apiData.TRANSFD
      ? parseFloat(apiData.TRANSFD)
      : 0;
    attendance.bereavementLeaveDuration = apiData.BEREAVD
      ? parseFloat(apiData.BEREAVD)
      : 0;
    attendance.maternityLeaveDuration = apiData.MATENTD
      ? parseFloat(apiData.MATENTD)
      : 0;
    attendance.paternityLeaveDuration = apiData.PAMATED
      ? parseFloat(apiData.PAMATED)
      : 0;
    attendance.pregnancyCheckLeaveDuration = apiData.MATECKD
      ? parseFloat(apiData.MATECKD)
      : 0;
    attendance.miscarriageLeaveDuration = apiData.ABORTND
      ? parseFloat(apiData.ABORTND)
      : 0;
    attendance.familyVisitLeaveDuration = apiData.FAMILYD
      ? parseFloat(apiData.FAMILYD)
      : 0;
    attendance.nonAttendanceLeaveDuration = apiData.UNWORKD
      ? parseFloat(apiData.UNWORKD)
      : 0;
    attendance.breastfeedingLeaveDuration = apiData.BREASTD
      ? parseFloat(apiData.BREASTD)
      : 0;
    attendance.breastfeedingTime = apiData.FEDBRK
      ? parseFloat(apiData.FEDBRK)
      : 0;
    attendance.combinedBreastfeedingTime = apiData.FEDMRGD
      ? parseFloat(apiData.FEDMRGD)
      : 0;
    attendance.parentalLeaveDuration = apiData.BABCRED
      ? parseFloat(apiData.BABCRED)
      : 0;
    attendance.annualLeave = apiData.ANNUAL ? parseFloat(apiData.ANNUAL) : 0;
    attendance.personalLeave = apiData.PRIAFF ? parseFloat(apiData.PRIAFF) : 0;
    attendance.shortTermSickLeave = apiData.SIKAFF
      ? parseFloat(apiData.SIKAFF)
      : 0;
    attendance.marriageLeave = apiData.WEDING ? parseFloat(apiData.WEDING) : 0;
    attendance.compensatoryLeave = apiData.TRANSF
      ? parseFloat(apiData.TRANSF)
      : 0;
    attendance.bereavementLeave = apiData.BEREAV
      ? parseFloat(apiData.BEREAV)
      : 0;
    attendance.maternityLeave = apiData.MATENT ? parseFloat(apiData.MATENT) : 0;
    attendance.paternityLeave = apiData.PAMATE ? parseFloat(apiData.PAMATE) : 0;
    attendance.pregnancyCheckLeave = apiData.MATECK
      ? parseFloat(apiData.MATECK)
      : 0;
    attendance.miscarriageLeave = apiData.ABORTN
      ? parseFloat(apiData.ABORTN)
      : 0;
    attendance.familyVisitLeave = apiData.FAMILY
      ? parseFloat(apiData.FAMILY)
      : 0;
    attendance.nonAttendanceLeave = apiData.UNWORK
      ? parseFloat(apiData.UNWORK)
      : 0;
    attendance.breastfeedingLeave = apiData.BREAST
      ? parseFloat(apiData.BREAST)
      : 0;
    attendance.compensationMethod = apiData.CPSTY1;
    attendance.overtimeLateDuration = apiData.RJBCD1
      ? parseFloat(apiData.RJBCD1)
      : 0;
    attendance.overtimeEarlyLeaveDuration = apiData.RJBZT1
      ? parseFloat(apiData.RJBZT1)
      : 0;
    attendance.overtimeAttendanceDuration = apiData.ZJBCQS
      ? parseFloat(apiData.ZJBCQS)
      : 0;
    attendance.overtimeAbsenceDuration = apiData.RJBQQS
      ? parseFloat(apiData.RJBQQS)
      : 0;
    attendance.overtimeMissingCardCount = apiData.RJBQKC
      ? Number(apiData.RJBQKC)
      : 0;
    attendance.overtimeLeaveDuration = apiData.RJBQJ
      ? parseFloat(apiData.RJBQJ)
      : 0;
    return attendance;
    // 将数据保存到数据库
    // await AtdDayResult.upsert(attendance, ["date", "userId"]);
  }
}
