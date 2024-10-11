import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../wechat/User";
import { pointTransformer } from "../../utils/general";

@Entity("xft_atd_trip_checkin")
export class XftTripCheckin extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "fbt_root_id" })
  fbtRootId: string;
  @Column()
  name: string;
  @Column({ name: "user_id" })
  userId: string;
  @Column({ name: "xft_id" })
  xftId: string;
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
  @Column({
    type: "point",
    spatialFeatureType: "Point",
    srid: 4326,
    transformer: pointTransformer, // 使用转换器
    nullable: true,
  })
  location: { longitude: number; latitude: number };
  @Column({ nullable: true })
  photo: string;
  @Column({ name: "event_id", nullable: true })
  eventId: string;
  @Column({ nullable: true, name: "process_id" })
  processId: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord({ userId, fbtRootId, checkinDate }) {
    // const exist = await XftTripCheckin.exists({
    //   where: {
    //     userId,
    //     checkinDate,
    //   },
    // });
    // if (exist) return null;
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user)
      throw new Error(`XftTripCheckin, addRecord, User not found ${userId}`);
    const checkin = new XftTripCheckin();
    checkin.fbtRootId = fbtRootId;
    checkin.userId = userId;
    checkin.xftId = user.xft_enterprise_id;
    checkin.departmentId = user.main_department_id;
    checkin.name = user.name;
    checkin.checkinDate = new Date(checkinDate);
    checkin.state = "未发起";
    return await checkin.save();
  }
}
