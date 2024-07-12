import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";
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

@Entity()
export class ParkingInfo extends BaseEntity {
  @PrimaryColumn()
  id: string;
  @Column()
  ownerId: string;
  @Column()
  ownerName: string;
  @Column()
  ownerPhone: string;
  @Column()
  carNum: string;
  @Column()
  licensePlateColor: string;
  @Column()
  beginTime: Date;
  @Column()
  endTime: Date;

  static async addInfo(info: ParkingInfoType) {
    try {
      const newRecord = ParkingInfo.create({
        id: info.id,
        ownerId: info.ownerId,
        ownerName: info.ownerName,
        ownerPhone: info.ownerPhone,
        carNum: info.carNum,
        licensePlateColor: info.licensePlateColor,
        beginTime: new Date(info.beginTime),
        endTime: new Date(info.endTime),
      });
      await ParkingInfo.save(newRecord);
      return newRecord;
    } catch (e) {
      logger.error(e);
      logger.error(info);
    }
  }
  static async updateInfo(info: ParkingInfoType) {
    try {
      await ParkingInfo.update(
        { id: info.id },
        {
          ownerId: info.ownerId,
          ownerName: info.ownerName,
          ownerPhone: info.ownerPhone,
          carNum: info.carNum,
          licensePlateColor: info.licensePlateColor,
          beginTime: new Date(info.beginTime),
          endTime: new Date(info.endTime),
        }
      );
    } catch (e) {
      logger.error(e);
      logger.error(info);
    }
  }
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
