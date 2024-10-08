import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  PrimaryColumn,
  LessThanOrEqual,
  MoreThanOrEqual,
  UpdateDateColumn,
  CreateDateColumn,
} from "typeorm";

@Entity({ name: "log_trip_sync" })
export class LogTripSync extends BaseEntity {
  @PrimaryColumn({ name: "fbt_root_id" })
  fbtRootId: string;

  @Column({ name: "xft_bill_id", nullable: true })
  xftBillId: string;

  @Column({ name: "fbt_current_id", nullable: true })
  fbtCurrentId: string;

  @Column({ name: "user_id", nullable: true })
  userId: string;

  @Column({ name: "is_sync", nullable: true })
  isSync: boolean;

  @Column({ nullable: true })
  create_time: Date;

  @Column({ nullable: true })
  start_time: Date;

  @Column({ nullable: true })
  end_time: Date;

  @Column({ type: "jsonb", nullable: true })
  city: string[];

  @Column({ nullable: true })
  err: string;

  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;

  static async addRecord(
    fbtRootId: string,
    currentId: string,
    xftBillId:
      | {
          billId: any;
          error?: undefined;
        }
      | {
          error: any;
          billId?: undefined;
        },
    createTime: Date
  ) {
    const record = new LogTripSync();
    record.fbtRootId = fbtRootId;
    if (xftBillId.billId) {
      record.xftBillId = xftBillId.billId;
    } else {
      record.err = xftBillId.error;
    }
    record.fbtCurrentId = currentId;
    record.create_time = createTime;
    if (xftBillId.billId) {
      record.isSync = true;
    }
    await record.save();
  }

  static async getConflict(
    userId: string,
    start_time: Date,
    end_time: Date,
    create_time: Date
  ) {
    const conflicts = await LogTripSync.find({
      where: [
        {
          userId,
          start_time: LessThanOrEqual(end_time),
          end_time: MoreThanOrEqual(start_time),
          create_time: LessThanOrEqual(create_time),
        },
      ],
      select: ["start_time", "end_time", "fbtRootId"],
    });
    return conflicts;
  }
}
