import { format } from "date-fns";
import { parkingApiClient } from "../../utils/parking/app";
import { formDataApiClient } from "../../utils/jdy/form_data";
import { workflowApiClient } from "../../utils/jdy/workflow";
import { isTaskFinished } from "./jdyUtil";

export const addCar = async (data) => {
  const result = await parkingApiClient.addCar({
    carNum: data["_widget_1720515048364"],
    carOwner: data["_widget_1720515048366"],
    phone: data["_widget_1720515048369"],
    beginTime: format(new Date(data["_widget_1720515048370"]), "yyyy-MM-dd"),
    endTime: format(new Date(data["_widget_1720515048371"]), "yyyy-MM-dd"),
  });
  if (!result["success"]) {
    return;
  }
  const id = formDataApiClient.getFormId("车辆信息登记");
  await formDataApiClient.singleDataUpdate(id.appid, id.entryid, data._id, {
    _widget_1720515048363: { value: result?.["result"]?.["id"] },
  });
};

export const updateCar = async (data) => {
  await parkingApiClient.updateCar({
    id: data["_widget_1720515048363"],
    carNum: data["_widget_1720515048364"],
    carOwner: data["_widget_1720515048366"],
    phone: data["_widget_1720515048369"],
    beginTime: format(new Date(data["_widget_1720515048370"]), "yyyy-MM-dd"),
    endTime: format(new Date(data["_widget_1720515048371"]), "yyyy-MM-dd"),
  });
};

export const deleteCar = async (data) => {
  if (data["_widget_1720515048363"])
    await parkingApiClient.deleteCar(data["_widget_1720515048363"]);
};

export const punishCar = async (data) => {
  if (!(await isTaskFinished(data._id))) {
    return;
  }
  const punish = data["_widget_1720526149443"];
  let punishDate = 1;
  if (punish === "警告") {
    return;
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
  await parkingApiClient.updateCar({
    id: data["_widget_1720526149436"],
    beginTime: beginTime,
    endTime: "2028-12-31",
  });
};
