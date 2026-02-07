import {
  BaseEntity,
  Between,
  Column,
  Entity,
  Like,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { logger } from "../../../config/logger";
import { ParkingInfo } from "./vehicle_info";
import { trafficService } from "../../../services/entryService";
import { User } from "../../../entity/basic/employee";

interface CarRecord {
  parkingLotCode: string;
  carInTime?: string;
  carOutTime?: string;
  parkingRecordId: string;
  carNum: string;
  parkingLotId: string;
}
interface CardRecord {
  communityName: string;
  personId: number;
  enterOrExit: number;
  id: string;
  eventTime: string | number;
}
const locationMap = {
  "1854067794543378432_0001": "澄江分厂",
  "1806514428502343680_0001": "新前梦工厂",
  新前梦工厂: "新前梦工厂",
  澄江分厂: "澄江分厂",
};

@Entity({ name: "entry_exit_records" })
export class EntryExistRecords extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "record_id" })
  recordId: string;
  @Column({ nullable: true, name: "user_id" })
  userId: string;
  @Column({ nullable: true })
  name: string;
  @Column({ nullable: true })
  phone: string;
  @Column({ name: "is_visitor" })
  isVisitor: boolean;
  @Column()
  location: string;
  @Column({ name: "enter_or_exit" })
  enterOrExit: number;
  @Column()
  method: string;
  @Column({ nullable: true, name: "car_num" })
  carNum: string;
  @Column()
  time: Date;
  @Column("interval", { nullable: true })
  gap: number;
  @Column({ nullable: true })
  image: string;
  @Column({ nullable: true })
  url: string;
  @Column({ nullable: true, name: "out_id" })
  outId: string;
  @Column({ nullable: true, name: "out_type" })
  outType: string;

  static async addCarRecord(record: CarRecord, fileName: string) {
    const exists = await this.exists({
      where: {
        recordId: record.parkingRecordId,
        enterOrExit: record.carInTime ? 0 : 1,
      },
    });
    if (exists) return;
    let userId, name, phone, gap;
    const url = fileName
      ? "http://hz.jc-times.com:2000/images/car/" +
        fileName.split("/").pop()?.split(".")[0]
      : "";
    const carNum = record.carNum;
    const method = record.carInTime ? "车辆入场" : "车辆出场";
    const enterOrExit = record.carInTime ? 0 : 1;
    const time = record.carInTime
      ? new Date(record.carInTime)
      : record.carOutTime
      ? new Date(record.carOutTime)
      : new Date();
    const location = locationMap[record.parkingLotId] ?? "其他";
    const carInfo = await ParkingInfo.getInfoByCarNum(record.carNum);
    if (carInfo) {
      userId = carInfo.ownerId;
      name = carInfo.ownerName;
      phone = carInfo.ownerPhone;
    }
    if (userId) {
      const existRecord =
        (await this.getLeastRecordByUserId(userId)) ??
        (await this.getLeastRecordByCarNum(carNum));
      gap =
        existRecord && existRecord.enterOrExit != enterOrExit
          ? (time.getTime() - existRecord.time.getTime()) / 1000
          : null;
    }
    let dbRecord = this.create({
      recordId: record.parkingRecordId,
      userId,
      name,
      phone,
      location,
      enterOrExit,
      method,
      carNum,
      time,
      gap,
      isVisitor: false,
      image: fileName,
      url,
    });
    dbRecord = await dbRecord.save();
    if (userId && dbRecord) {
      if (enterOrExit === 0) {
        await trafficService.addIn(userId, time);
      } else {
        await trafficService.addOut(dbRecord.id, time, userId, name);
      }
    }
  }
  static async addCardRecord(record: CardRecord, fileName: string) {
    const exists = await this.exists({
      where: {
        recordId: record.id,
      },
    });
    if (exists) return;
    if (record.eventTime == 0) return;
    if (!record.personId) return;
    let userId, name, phone, gap;
    const url = fileName
      ? "http://hz.jc-times.com:2000/images/card/" +
        fileName.split("/").pop()?.split(".")[0]
      : "";
    const method = record.enterOrExit == 1 ? "人脸入场" : "人脸出场";
    const enterOrExit = record.enterOrExit == 1 ? 0 : 1;
    const time = new Date(record.eventTime);
    const location = locationMap[record.communityName] ?? "其他";
    const user = await User.findOne({
      where: {
        dahua_id: Like(record.personId.toString().substring(0, 15) + "%"),
      },
    });
    if (user) {
      userId = user.user_id;
      name = user.name;
    }
    if (userId) {
      const existRecord = await this.getLeastRecordByUserId(userId);
      if (existRecord) {
        gap = (time.getTime() - existRecord.time.getTime()) / 1000;

        if (gap >= 0 && gap < 15 && enterOrExit == existRecord.enterOrExit) {
          return;
        }
        if (gap < 0 || record.enterOrExit == existRecord.enterOrExit) {
          gap = null;
        }
      }
    }
    let dbRecord = this.create({
      recordId: record.id,
      userId,
      name,
      phone,
      location,
      enterOrExit,
      method,
      time,
      gap,
      isVisitor: false,
      image: fileName,
      url,
    });
    dbRecord = await dbRecord.save();
    if (userId && dbRecord) {
      if (enterOrExit === 0) {
        await trafficService.addIn(userId, time);
      } else {
        await trafficService.addOut(dbRecord.id, time, userId, name);
      }
    }
  }
  static async getLeastRecordByUserId(userId: string) {
    return await EntryExistRecords.createQueryBuilder("records")
      .where("records.user_id = :userId", {
        userId: userId,
      })
      .orderBy("records.time", "DESC")
      .getOne();
  }
  private static async getLeastRecordByCarNum(carNum: string) {
    return await EntryExistRecords.createQueryBuilder("records")
      .where("records.car_num = :carNum", {
        carNum: carNum,
      })
      .orderBy("records.time", "DESC")
      .getOne();
  }
  static async setOutId(
    beginDate: Date,
    endDate: Date,
    outId: string,
    userid: string,
    outType: string
  ) {
    const records = await EntryExistRecords.find({
      where: { time: Between(beginDate, endDate), userId: userid },
    });
    for (const record of records) {
      record.outId = outId;
      record.outType = outType;
      record.save();
    }
  }
}
