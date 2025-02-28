import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { logger } from "../../config/logger";

type ParkingInfoType = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  carNum: string;
  licensePlateColor: string;
  beginTime: string;
  endTime: string;
};

@Entity({ name: "parking_info" })
export class ParkingInfo extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "xin_qian_id", unique: true, nullable: true })
  xinQianId: string;
  @Column({ name: "cheng_jiang_id", unique: true, nullable: true })
  chengJiangId: string;
  @Column({ name: "user_id" })
  ownerId: string;
  @Column({ name: "name", nullable: true })
  ownerName: string;
  @Column({ name: "phone", nullable: true })
  ownerPhone: string;
  @Column({ name: "car_num", nullable: true })
  carNum: string;
  @Column({ nullable: true })
  type: string;
  @Column({ nullable: true })
  brand: string;
  @Column({ name: "license_plate_color", nullable: true })
  licensePlateColor: string;
  @Column({ name: "begin_time", nullable: true })
  beginTime: Date;
  @Column({ name: "end_time", nullable: true })
  endTime: Date;
  @CreateDateColumn({ name: "created_at", nullable: true })
  createdAt: Date;

  // static async addInfo(info: ParkingInfoType, type?, brand?) {
  //   try {
  //     const newRecord = ParkingInfo.create({
  //       id: info.id,
  //       ownerId: info.ownerId,
  //       ownerName: info.ownerName,
  //       ownerPhone: info.ownerPhone,
  //       carNum: info.carNum,
  //       licensePlateColor: info.licensePlateColor,
  //       beginTime: new Date(info.beginTime),
  //       endTime: new Date(info.endTime),
  //       type,
  //       brand,
  //     });
  //     await ParkingInfo.save(newRecord);
  //     return newRecord;
  //   } catch (e) {
  //     logger.error(e);
  //     logger.error(info);
  //   }
  // }
  // static async updateInfo(info: ParkingInfoType) {
  //   try {
  //     await ParkingInfo.update(
  //       { id: info.id },
  //       {
  //         ownerId: info.ownerId,
  //         ownerName: info.ownerName,
  //         ownerPhone: info.ownerPhone,
  //         carNum: info.carNum,
  //         licensePlateColor: info.licensePlateColor,
  //         beginTime: new Date(info.beginTime),
  //         endTime: new Date(info.endTime),
  //       }
  //     );
  //   } catch (e) {
  //     logger.error(e);
  //     logger.error(info);
  //   }
  // }
  static async getInfoByCarNum(carNum: string) {
    return await ParkingInfo.findOne({ where: { carNum: carNum } });
  }
  static async test() {
    // await ParkingInfo.addInfo({
    //   id: "1",
    //   ownerId: "1",
    //   ownerName: "Owner 1",
    //   ownerPhone: "1234567890",
    //   carNum: "Car 1",
    //   licensePlateColor: "Blue",
    //   beginTime: "2022-01-01T08:00:00",
    //   endTime: "2022-01-01T10:00:00",
    // });

    // await ParkingInfo.updateInfo({
    //   id: "1",
    //   ownerId: "2",
    //   ownerName: "Owner 1",
    //   ownerPhone: "1234567890",
    //   carNum: "Car 1",
    //   licensePlateColor: "Red",
    //   beginTime: "2022-01-01T08:00:00",
    //   endTime: "2022-01-01T10:00:00",
    // });
    console.log(await ParkingInfo.getInfoByCarNum("Car 1"));
  }
}
