import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../basic/employee";
import { JdyUtil } from "../../utils/jdyUtils";
import { logger } from "../../config/logger";
@Entity("atd_rest_overtime")
export class JdyRestOvertime extends BaseEntity {
  @PrimaryColumn()
  id: string;
  @Column({ nullable: true })
  name: string;
  @Column({ nullable: true })
  userid: string;
  @Column({ nullable: true })
  startTime: Date;
  @Column({ nullable: true })
  endTime: Date;
  @Column({ name: "duration_hour", type: "decimal", nullable: true, scale: 2 })
  duration: number;
  @Column({ name: "duration_day", nullable: true, type: "decimal", scale: 2 })
  durationDay: number;
  @Column({ nullable: true })
  type: string;
  @Column({ nullable: true })
  remark: string;
  @Column({ nullable: true })
  result: string;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async createRecord(record) {
    const jdyUser = JdyUtil.getUser(record["_widget_1691150876586"]);
    const user = await User.findOne({ where: { user_id: jdyUser.username } });
    if (!user) {
      logger.error(`User not found at JdyRestOvertime: ${jdyUser.username}`);
      return;
    }
    const data = JdyRestOvertime.create();
    data.id = record._widget_1694856408626;
    data.name = user.name;
    data.userid = user.user_id;
    data.startTime = JdyUtil.getDate(record._widget_1691147512529);
    data.endTime = JdyUtil.getDate(record._widget_1691147512534);
    data.type = record._widget_1691550230734;
    data.remark = record._widget_1691147512527;
    data.result = record._widget_1691481359331;
    data.duration = record._widget_1691147512530;
    if (data.type == "轮休假加班") {
      data.durationDay = data.duration >= 8 ? 1 : 0.5;
    } else {
      data.durationDay = Number((data.duration / 8).toFixed(2));
    }
    return data;
    // await JdyRestOvertime.upsert(data, ["id"]);
  }
}
