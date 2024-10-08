import { addDays, format } from "date-fns";
import { fbtApplyApiClient } from "../utils/fenbeitong/apply";
import { FbtApply } from "../entity/fbt/apply";
import { Between } from "typeorm";
import _ from "lodash";
import { xftItripApiClient } from "../utils/xft/xft_itrip";
import { XftCity } from "../entity/xft/city";
import { User } from "../entity/wechat/User";
import { LogTripSync } from "../entity/common/log_trip";
import { error } from "console";
import e from "express";

export const getTodayApply = async () => {
  //   const startTime = addDays(new Date(), -1);
  //   const endTime = new Date();
  const startTime = new Date("2024-10-01");
  const endTime = new Date("2024-10-08");

  const formList = await fbtApplyApiClient.getCustomFormList({
    approve_start_time: format(startTime, "yyyy-MM-dd"),
    approve_end_time: format(endTime, "yyyy-MM-dd"),
  });
  const existCode = (
    await FbtApply.find({
      where: { complete_time: Between(startTime, endTime) },
      select: ["code"],
    })
  ).map((item) => item.code);
  const result = _.difference(
    formList.map((item) => item.code),
    existCode
  );
  for (const code of result) {
    const record = await fbtApplyApiClient.getTripDetail(code);
    if (record["code"] != 0) return;
    const apply = await FbtApply.addApply(record["data"]["apply"]);
    await hasParentId(record);
    await 添加xft差旅记录(apply);
  }
};

const hasParentId = async (record) => {
  if (record["data"]["apply"].hasOwnProperty("parent_id")) {
    const parentApply = await FbtApply.findOne({
      where: { id: record["data"]["apply"]["parent_id"] },
    });
    if (!parentApply || parentApply.state != 2048) {
      const parentRecord = await fbtApplyApiClient.getTripDetail(
        record["data"]["apply"]["parent_id"]
      );
      if (parentRecord["code"] == 0) {
        if (!parentApply)
          await FbtApply.addApply(parentRecord["data"]["apply"]);
        else if (parentApply.state != 2048)
          await FbtApply.updateApply(parentRecord["data"]["apply"]);
      }
    }
  }
};

const 修改xft差旅记录 = async (apply: FbtApply) => {};

export const 添加xft差旅记录 = async (apply: FbtApply) => {
  if (apply.state != 4) return;
  const exist = await LogTripSync.exists({
    where: { fbtRootId: apply.root_id },
  });
  if (!exist) {
    const billid = await _添加xft差旅记录(apply);
    await LogTripSync.addRecord(
      apply.root_id,
      apply.id,
      billid,
      apply.create_time
    );
  }
};

const _添加xft差旅记录 = async (fbtApply: FbtApply) => {
  if (fbtApply.city.length < 2) {
    return { error: fbtApply.city.map((city) => city.name).join(",") };
  }
  let applier;
  if (fbtApply.user.map((user) => user.fbtId).includes(fbtApply.proposer_id)) {
    applier = fbtApply.proposerUserId.slice(0, 20);
  } else {
    applier = fbtApply.user[0].userId.slice(0, 20);
  }
  if (!applier) return { error: "no applier" };
  const departCityCode =
    (await XftCity.findOne({ where: { cityName: fbtApply.city[0].name } }))
      ?.cityCode ?? "96";
  const destinationCityCode =
    (await XftCity.findOne({ where: { cityName: fbtApply.city[1].name } }))
      ?.cityCode ?? "1";
  const cities = fbtApply.city.map((city) => {
    return city.name;
  });
  const result = await xftItripApiClient.createApplyTravel({
    eventNumber: "01240921022004000001",
    outRelId: fbtApply.id,
    empNumber: applier,
    customFieldValues: [
      {
        fieldNumber: "reason",
        fieldValue: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(",")}`,
      },
    ],
    billStatus: "APPRV",
    businessTrip: {
      businessTripDetails: [
        {
          departCityCode,
          destinationCityCode,
          beginTime: format(new Date(fbtApply.start_time), "yyyy-MM-dd HH:mm"),
          endTime: format(new Date(fbtApply.end_time), "yyyy-MM-dd HH:mm"),
          beginTimePrecision:
            new Date(fbtApply.start_time).getHours() < 12 ? "AM" : "PM",
          endTimePrecision:
            new Date(fbtApply.end_time).getHours() < 12 ? "AM" : "PM",
          tripReason: `${fbtApply.reason} ${fbtApply.remark} ${cities.join(
            ","
          )}`,
        },
      ],
    },
    peerEmpNumbers: fbtApply.user
      .map((user) => user.userId)
      .filter((user) => user != applier),
  });
  if (result["returnCode"] == "SUC0000") return { billId: result["body"] };
  else return { error: result };
};

const _修改xft差旅记录 = async () => {};

const 每日获取订单 = async () => {};
