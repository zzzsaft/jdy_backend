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
import { logger } from "../../config/logger";
import AbstractContent from "../AbstractContent";

type ParkingRecordType = {
  parkingRecordId: string;
  status: number;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  isVisitor: number;
  carNum: string;
  carTime: string;
  carPic: string;
  laneCode: string;
};

@Entity()
export class ParkingRecord extends AbstractContent {
  @Column({ nullable: true })
  ownerId: string;

  @Column({ nullable: true })
  ownerName: string;

  @Column({ nullable: true })
  ownerPhone: string;

  @Column({ nullable: true })
  isVisitor: boolean;

  @Column()
  carNum: string;

  @Column({ nullable: true })
  inRecordId: string;

  @Column("timestamp", { nullable: true })
  inCarTime: Date;

  @Column({ nullable: true })
  inCarPic: string;

  @Column({ nullable: true })
  outRecordId: string;

  @Column("timestamp", { nullable: true })
  outCarTime: Date;

  @Column({ nullable: true })
  outCarPic: string;

  @Column({ nullable: true })
  laneCode: string;

  @Column("interval", { nullable: true })
  duration: number;

  static async addRecord(record: ParkingRecordType) {
    try {
      if (record.status === 0) {
        // 进厂，插入数据
        const newRecord = ParkingRecord.create({
          ownerId: record.ownerId,
          ownerName: record.ownerName,
          ownerPhone: record.ownerPhone,
          isVisitor: !!record.isVisitor,
          carNum: record.carNum,
          inRecordId: record.parkingRecordId,
          inCarTime: new Date(record.carTime),
          inCarPic: record.carPic,
          laneCode: record.laneCode,
        });
        await ParkingRecord.save(newRecord);
      } else {
        // 出厂，查找并更新数据
        const existingRecord = await ParkingRecord.createQueryBuilder(
          "parkingRecord"
        )
          .where("parkingRecord.ownerId = :ownerId", {
            ownerId: record.ownerId,
          })
          .andWhere("parkingRecord.inCarTime IS NOT NULL")
          .andWhere("parkingRecord.outCarTime IS NULL")
          .orderBy("parkingRecord.created_at", "DESC")
          .getOne();

        if (existingRecord) {
          existingRecord.outRecordId = record.parkingRecordId;
          existingRecord.outCarTime = new Date(record.carTime);
          existingRecord.outCarPic = record.carPic;
          existingRecord.duration =
            (existingRecord.outCarTime.getTime() -
              existingRecord.inCarTime.getTime()) /
            1000;
          await ParkingRecord.save(existingRecord);
        } else {
          const newRecord = ParkingRecord.create({
            ownerId: record.ownerId,
            ownerName: record.ownerName,
            ownerPhone: record.ownerPhone,
            isVisitor: !!record.isVisitor,
            carNum: record.carNum,
            outRecordId: record.parkingRecordId,
            outCarTime: new Date(record.carTime),
            outCarPic: record.carPic,
            laneCode: record.laneCode,
          });
          await ParkingRecord.save(newRecord);
        }
      }
    } catch (e) {
      logger.error(e);
      logger.error(record);
    }
  }
  static async testRecords() {
    const records = [
      //   {
      //     parkingRecordId: "1",
      //     status: 0,
      //     ownerId: "1",
      //     ownerName: "Owner 1",
      //     ownerPhone: "1234567890",
      //     isVisitor: 0,
      //     carNum: "Car 1",
      //     carTime: "2022-01-01T08:00:00",
      //     carPic: "inCarPic1.jpg",
      //     laneCode: "Lane 1",
      //   },
      {
        parkingRecordId: "2",
        status: 1,
        ownerId: "2",
        ownerName: "Owner 2",
        ownerPhone: "2345678901",
        isVisitor: 1,
        carNum: "Car 2",
        carTime: "2022-01-01T09:00:00",
        carPic: "inCarPic2.jpg",
        laneCode: "Lane 2",
      },
      {
        parkingRecordId: "3",
        status: 1,
        ownerId: "1",
        ownerName: "Owner 1",
        ownerPhone: "2345678901",
        isVisitor: 1,
        carNum: "Car 2",
        carTime: "2022-01-01T09:08:00",
        carPic: "inCarPic2.jpg",
        laneCode: "Lane 2",
      },
    ];
    for (const record of records) {
      await this.addRecord(record);
    }
  }
}
