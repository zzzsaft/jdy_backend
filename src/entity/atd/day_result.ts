// import {
//   Entity,
//   Column,
//   OneToMany,
//   Relation,
//   Index,
//   BaseEntity,
// } from "typeorm";
// import AbstractContent from "../AbstractContent";
// import { CheckinData } from "./checkin_data";
// import { HardwareCheckinData } from "./wx_hardware_checkin_data";

// @Entity({ name: "atd_day_result" })
// export class DayResult extends BaseEntity {
//   @Column("date")
//   date: Date;
//   @Column()
//   userid: string;

//   考勤组: string;
//   班次: string;
//   上班地点: string;
//   类型: string;
//   最早卡: string;
//   最晚卡: string;
//   @Column({ type: "time", nullable: true })
//   上班1打卡时间: string;
//   上班1打卡结果: string;
//   @Column({ type: "time", nullable: true })
//   下班1打卡时间: string;
//   下班1打卡结果: string;
//   @Column({ type: "time", nullable: true })
//   上班2打卡时间: string;
//   上班2打卡结果: string;
//   @Column({ type: "time", nullable: true })
//   下班2打卡时间: string;
//   下班2打卡结果: string;
//   @Column({ type: "time", nullable: true })
//   上班3打卡时间: string;
//   上班3打卡结果: string;
//   @Column({ type: "time", nullable: true })
//   下班3打卡时间: string;
//   下班3打卡结果: string;
//   出勤天数: string;
//   应出勤时长: string;
//   实际出勤时长: string;
//   迟到时长: string;
//   迟到次数: string;
//   早退时长: string;
//   早退次数: string;
//   补卡次数: string;
//   休息天数: string;
//   严重迟到次数: string;
//   严重迟到时长: string;
//   旷工迟到次数: string;
//   上班缺卡次数: string;
//   下班缺卡次数: string;
//   外勤打卡次数: string;
//   旷工天数: string;
//   出差天数: string;
//   外出时长: string;
//   餐补资格: string;
//   缺勤时长: string;
//   工作日加班: string;
//   休息日加班: string;
//   节假日加班: string;
//   年假时长: string;
//   事假时长: string;
//   短期病假时长: string;
//   婚假时长: string;
//   调休假时长: string;
//   丧假时长: string;
//   产假时长: string;
//   陪产假时长: string;
//   产检假时长: string;
//   流产假时长: string;
//   探亲假时长: string;
//   非出勤假时长: string;
//   哺乳假时长: string;
//   哺乳时间: string;
//   合并哺乳时间: string;
//   育儿假时长: string;
//   年假: string;
//   事假: string;
//   短期病假: string;
//   婚假: string;
//   调休假: string;
//   丧假: string;
//   产假: string;
//   陪产假: string;
//   产检假: string;
//   流产假: string;
//   探亲假: string;
//   非出勤假: string;
//   哺乳假: string;
//   补偿方式: string;
//   加班迟到时长: string;
//   加班早退时长: string;
//   加班出勤时长: string;
//   加班缺勤时长: string;
//   加班缺卡次数: string;
//   加班请假时长: string;
// }
