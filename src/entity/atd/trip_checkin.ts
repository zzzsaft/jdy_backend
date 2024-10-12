import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  // Point,
} from "typeorm";
import { User } from "../basic/employee";
import { pointTransformer } from "../../utils/general";
import { Point } from "geojson";

@Entity("atd_trip_checkin")
export class XftTripCheckin extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "fbt_root_id", nullable: true })
  fbtRootId: string;
  @Column()
  name: string;
  @Column({ name: "user_id" })
  userId: string;
  @Column({ nullable: true })
  remark: string;
  @Column({ nullable: true })
  departmentId: string;
  @Column({ name: "send_date", nullable: true })
  sendDate: Date;
  @Column({ type: "date", name: "checkin_date" })
  checkinDate: Date;
  @Column({ name: "checkin_time", nullable: true })
  checkinTime: Date;
  @Column()
  state: string;
  @Column({ nullable: true })
  latitude: number;
  @Column({ nullable: true })
  longitude: number;
  @Column({ nullable: true })
  address: string;
  @Column({ nullable: true })
  reason: string;
  @Column({ nullable: true })
  custom: string;
  @Column({ nullable: true })
  contact: string;
  @Column({ name: "contact_num", nullable: true })
  contactNum: string;
  @Column({ nullable: true })
  photo: string;
  @Column({ name: "jdy_id", nullable: true })
  jdyId: string;
  @Column({ nullable: true, name: "process_id" })
  processId: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord({ userId, fbtRootId, checkinDate }) {
    const exist = await XftTripCheckin.exists({
      where: {
        userId,
        checkinDate,
      },
    });
    if (exist) return null;
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user)
      throw new Error(`XftTripCheckin, addRecord, User not found ${userId}`);
    const checkin = new XftTripCheckin();
    checkin.fbtRootId = fbtRootId;
    checkin.userId = userId;
    checkin.departmentId = user.main_department_id;
    checkin.name = user.name;
    checkin.checkinDate = new Date(checkinDate);
    checkin.state = "未发起";
    return await checkin.save();
  }

  static async addExist({
    userId,
    checkinTime,
    location,
    address,
    reason,
    custom,
    contact,
    contactNum,
    remark,
    jdyId,
  }: {
    userId: string;
    checkinTime: Date;
    location: { longitude: number; latitude: number };
    address: string;
    reason: string;
    custom: string;
    contact: string;
    contactNum: string;
    remark: string;
    jdyId: string;
  }) {
    const checkinDate = new Date(checkinTime);
    checkinDate.setHours(0, 0, 0, 0);
    const exist = await XftTripCheckin.exists({
      where: {
        userId,
        checkinDate,
      },
    });
    if (exist) return null;
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user)
      throw new Error(`XftTripCheckin, addRecord, User not found ${userId}`);
    const checkin = new XftTripCheckin();
    checkin.userId = userId;
    checkin.departmentId = user.main_department_id;
    checkin.name = user.name;
    checkin.checkinDate = new Date(checkinDate);
    checkin.checkinTime = new Date(checkinTime);
    checkin.address = address;
    checkin.latitude = location.latitude;
    checkin.longitude = location.longitude;
    checkin.reason = reason;
    checkin.custom = custom;
    checkin.contact = contact;
    checkin.contactNum = contactNum;
    checkin.remark = remark;
    checkin.jdyId = jdyId;

    checkin.state = "已打卡";
    return checkin;
  }
}
