import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  ManyToOne,
  Relation,
  Index,
} from "typeorm";
import { Checkin } from "./checkin";

@Entity({ name: "atd_checkin_data" })
export class CheckinData extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number; // 主键，自动生成的唯一标识符

  @Column("date")
  checkin_date: Date;

  @Column()
  userid: string; // 用户id

  @Column()
  groupname: string; // 打卡规则名称

  @Column()
  checkin_type: string; // 打卡类型。目前有：上班打卡，下班打卡，外出打卡

  @Column({ nullable: true })
  exception_type: string; // 异常类型，包括：时间异常，地点异常，未打卡，wifi异常，非常用设备。如果有多个异常，以分号间隔
  @Column("timestamp", { nullable: true })
  checkin_time: Date;
  @Column("bigint", { nullable: true })
  unix_checkin_time: number; // 打卡时间。Unix时间戳

  @Column({ nullable: true })
  location_title: string; // 打卡地点title

  @Column({ nullable: true })
  location_detail: string; // 打卡地点详情

  @Column({ nullable: true })
  wifiname: string; // 打卡wifi名称

  @Column({ nullable: true })
  notes: string; // 打卡备注

  @Column({ nullable: true })
  wifimac: string; // 打卡的MAC地址/bssid

  @Column({ nullable: true })
  mediaids: string; // 打卡的附件media_id，可使用media/get获取附件

  @Column({ nullable: true })
  lat: number; // 位置打卡地点纬度，是实际纬度的1000000倍，与腾讯地图一致采用GCJ-02坐标系统标准

  @Column({ nullable: true })
  lng: number; // 位置打卡地点经度，是实际经度的1000000倍，与腾讯地图一致采用GCJ-02坐标系统标准

  @Column({ nullable: true })
  deviceid: string; // 打卡设备id

  @Column("timestamp", { nullable: true })
  sch_checkin_time: Date;
  @Column({ nullable: true })
  unix_sch_checkin_time: number; // 标准打卡时间，指此次打卡时间对应的标准上班时间或标准下班时间

  @Column({ nullable: true })
  groupid: string; // 规则id，表示打卡记录所属规则的id

  @Column({ nullable: true })
  schedule_id: string; // 班次id，表示打卡记录所属规则中，所属班次的id

  @Column({ nullable: true })
  timeline_id: string; // 时段id，表示打卡记录所属规则中，某一班次中的某一时段的id，如上下班时间为9:00-12:00、13:00-18:00的班次中，9:00-12:00为其中一组时段
  @ManyToOne(() => Checkin, (checkin) => checkin.checkin_data)
  checkin: Relation<Checkin>;
  @CreateDateColumn()
  created_at: Date;

  //验证字段
  @Column({ nullable: true })
  check_state: string; // 打卡状态。Normal：正常；Early：早退；Late：迟到；Absenteeism：旷工迟到；NotSigned：未打卡
}
