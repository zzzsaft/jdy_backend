import { format } from "date-fns";
import { parkingApiClient } from "../../api/parking/app";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { isTaskFinished } from "./jdyUtil";
import { MessageHelper } from "../../api/wechat/message";
import { logger } from "../../config/logger";
import { ParkingInfo } from "../../entity/parking/dh_car_info";
import { carPlateServices } from "../../services/carPlateServices";

export const addCar = async (data) => {
  const carNum = data["_widget_1720515048364"];
  const carOwner = data["_widget_1720515048366"];
  const phone = data["_widget_1720515048369"];
  const beginTime = format(
    new Date(data["_widget_1720515048370"]),
    "yyyy-MM-dd"
  );
  const endTime = format(new Date(data["_widget_1720515048371"]), "yyyy-MM-dd");
  const licensePlateColor = data["_widget_1720677256474"] ?? "蓝色";
  const brand = data["_widget_1721320993137"];
  const type = data["_widget_1721320851863"];

  const userId = data["_widget_1720515048365"];
  const result = await carPlateServices.addCarPlate({
    carNum,
    carOwner,
    phone,
    licensePlateColor,
    beginTime,
    endTime,
    userId,
    type,
    brand,
  });
  const id = jdyFormDataApiClient.getFormId("车辆信息登记");
  await jdyFormDataApiClient.singleDataUpdate(id.appid, id.entryid, data._id, {
    _widget_1720515048363: { value: result.xinQianId },
  });
};

export const updateCar = async (data) => {
  const id = data["_widget_1720515048363"];
  const carNum = data["_widget_1720515048364"];
  const carOwner = data["_widget_1720515048366"];
  const phone = data["_widget_1720515048369"];
  const beginTime = format(
    new Date(data["_widget_1720515048370"]),
    "yyyy-MM-dd"
  );
  const endTime = format(new Date(data["_widget_1720515048371"]), "yyyy-MM-dd");
  const licensePlateColor = data["_widget_1720677256474"] ?? "蓝色";
  const userId = data["_widget_1720515048365"];
  if (!id) return;
  await carPlateServices.updateCarPlate({
    carNum,
    carOwner,
    phone,
    licensePlateColor,
    beginTime,
    endTime,
    userId,
    type: data["_widget_1721320851863"],
    brand: data["_widget_1721320993137"],
  });
};

export const deleteCar = async (data) => {
  if (data["_widget_1720515048363"])
    await parkingApiClient.deleteCar(data["_widget_1720515048363"]);
};

export const punishCar = async (data) => {
  // logger.info(data);
  if (!(await isTaskFinished(data._id))) {
    return;
  }
  const punish = data["_widget_1720526149443"];
  const plate_num = data["_widget_1720526149437"];
  const reason = data["_widget_1720526149442"];
  let punishDate = 0;
  if (punish === "警告") {
    punishDate = 0;
  } else if (punish === "三天") {
    punishDate = 3;
  } else if (punish === "一周") {
    punishDate = 7;
  } else if (punish === "一月") {
    punishDate = 30;
  }
  const beginTime = format(
    new Date(Date.now() + punishDate * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd"
  );
  if (punishDate != 0) {
    await parkingApiClient.updateCar({
      id: data["_widget_1720526149436"],
      beginTime: beginTime,
      endTime: "2028-12-31",
      userId: data["_widget_1720526149438"],
    });
  }
  const msg = new MessageHelper([data["_widget_1720526149438"]]);
  await msg.send_plain_text(
    `您的车辆${plate_num}因${reason}已被停车场处罚，处罚结果为${punish}，下次可停车时间为${beginTime}`
  );
};
