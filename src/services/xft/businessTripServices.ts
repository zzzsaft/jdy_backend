import { format } from "date-fns";
import { xftItripApiClient } from "../../api/xft/xft_itrip";
import {
  adjustToTimeNode,
  formatDate,
  getHalfDay,
} from "../../utils/dateUtils";
import { BusinessTrip } from "../../entity/atd/businessTrip";
import { XftCity } from "../../entity/util/xft_city";
import { FbtApply } from "../../entity/atd/fbt_trip_apply";
import { MessageHelper } from "../../api/wechat/message";

export class BusinessTripServices {
  static async 添加xft差旅记录(businessTrip: BusinessTrip, fbtApply: FbtApply) {
    if (!businessTrip || !fbtApply) return null;
    if (!businessTrip.start_time || !businessTrip.end_time) {
      businessTrip.err = `时间段为空${fbtApply.start_time} ${fbtApply.end_time}`;
      return null;
    }
    if (!businessTrip.userId) {
      businessTrip.err = `userId为空`;
      return null;
    }
    if (fbtApply.city.length == 1 && fbtApply.city[0].name.includes("台州")) {
      businessTrip.err = "台州";
      return;
    }
    let applier = businessTrip.userId.slice(0, 20);

    const departCityCode = await getCityCode(fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (fbtApply.city.length > 1) {
      destinationCityCode = await getCityCode(fbtApply.city[1].name);
    }

    const cities = fbtApply.city.map((city) => {
      return city.name;
    });
    const result = await xftItripApiClient.createApplyTravel({
      outRelId: fbtApply.root_id,
      empNumber: applier,
      reason: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(",")}`,
      departCityCode,
      destinationCityCode,
      start_time: adjustToTimeNode(businessTrip.start_time, true),
      end_time: adjustToTimeNode(businessTrip.end_time, true),
      peerEmpNumbers: fbtApply.user
        .map((user) => user.userId.slice(0, 20))
        .filter((user) => user != applier),
    });
    if (result["returnCode"] == "SUC0000") {
      businessTrip.err = "";
      businessTrip.xftBillId = result["body"];
      await businessTrip.save();
      sendMessages(businessTrip, fbtApply);
      return true;
    } else {
      businessTrip.err = result;
      await businessTrip.save();
      return null;
    }
  }

  static async 修改xft差旅记录(
    businessTrip: BusinessTrip,
    fbtApply: FbtApply,
    start_time: Date,
    end_time: Date
  ) {
    if (!businessTrip || !fbtApply) return null;
    if (!businessTrip.xftBillId) return null;
    if (!fbtApply.city || fbtApply.city.length == 0) return null;
    let applier = businessTrip.userId.slice(0, 20);
    const departCityCode = await getCityCode(fbtApply.city[0].name);
    let destinationCityCode = departCityCode;
    if (fbtApply.city.length > 1) {
      destinationCityCode = await getCityCode(fbtApply.city[1].name);
    }
    const result = await _修改xft差旅记录({
      billId: businessTrip.xftBillId,
      changerNumber: applier,
      departCityCode,
      destinationCityCode,
      start_time: adjustToTimeNode(start_time, true),
      end_time: adjustToTimeNode(end_time, true),
    });
    if (!businessTrip.reviseLogs) businessTrip.reviseLogs = [];
    let log = `原始时间${formatDate(businessTrip.start_time)} ${formatDate(
      businessTrip.end_time
    )} 修改为${formatDate(start_time)} ${formatDate(end_time)}`;
    if (result) {
      businessTrip.reviseLogs.push(`修改差旅记录成功 ${log}`);
      businessTrip.start_time = start_time;
      businessTrip.end_time = end_time;
      await businessTrip.save();
      await sendMessages(businessTrip, fbtApply);
      return true;
    } else {
      businessTrip.reviseLogs.push(`修改差旅记录失败 ${log}`);
      await businessTrip.save();
      return false;
    }
  }
}

const _修改xft差旅记录 = async ({
  billId,
  changerNumber,
  departCityCode,
  destinationCityCode,
  start_time,
  end_time,
  changeReason = "1",
}) => {
  const result = await xftItripApiClient.updateApplyTravel({
    billId,
    changerNumber,
    // peerEmpNumbers: [],
    changeReason,
    changeInfo: {
      businessTrip: {
        businessTripDetails: [
          {
            departCityCode,
            destinationCityCode,
            beginTime: format(start_time, "yyyy-MM-dd HH:mm"),
            endTime: format(end_time, "yyyy-MM-dd HH:mm"),
            beginTimePrecision: getHalfDay(start_time),
            endTimePrecision: getHalfDay(end_time),
            // timePrecisionType: "1",
          },
        ],
      },
    },
  });
  if (result["returnCode"] == "SUC0000") {
    return true;
  }
  return false;
};

const getCityCode = async (cityName: string) => {
  return (
    await XftCity.findOne({
      where: { cityName: cityName.split("/")[0].split(",")[0] },
    })
  )?.cityCode;
};

const sendMessages = async (businessTrip: BusinessTrip, fbtApply: FbtApply) => {
  if (process.env.NODE_ENV != "production") return;
  const startTime = businessTrip.start_time;
  const endTime1 = businessTrip.end_time;
  const beginTime = `${format(startTime, "yyyy-MM-dd")} ${getHalfDay(
    startTime
  )}`;
  const endTime = `${format(endTime1, "yyyy-MM-dd")} ${getHalfDay(endTime1)}`;
  // 发送消息
  await new MessageHelper([fbtApply.proposerUserId]).sendTextNotice({
    main_title: {
      title: "分贝通差旅同步考勤成功",
      desc: format(new Date(fbtApply.create_time), "yyyy-MM-dd HH:mm"),
    },
    sub_title_text: "",
    card_action: {
      type: 1,
      url: "https://xft.cmbchina.com/mobile-atd/#/trip-record",
    },
    horizontal_content_list: [
      {
        keyname: "原因",
        value: fbtApply.reason,
      },
      {
        keyname: "出差城市",
        value: fbtApply.city.map((city) => city.name).join(", "),
      },
      {
        keyname: "开始时间",
        value: beginTime,
      },
      {
        keyname: "结束时间",
        value: endTime,
      },
    ],
  });
};
