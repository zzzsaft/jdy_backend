import _ from "lodash";
import { logger } from "../../config/logger";
import { User } from "../../entity/wechat/User";
import { fileApiClient } from "../../utils/dahua/file";
import { personApiClient } from "../../utils/dahua/person";
import { downloadFileStream } from "../../utils/general";
import { formDataApiClient } from "../../utils/jdy/form_data";
import { xftUserApiClient } from "../../utils/xft/xft_user";

export const 入职申请表 = async (data) => {
  await saveNewInfotoDahua(data);
};

const getJdyInfo = async () => {
  const id = formDataApiClient.getFormId("员工档案");
  return await formDataApiClient.batchDataQuery(id.appid, id.entryid, {
    fields: ["_widget_1704997861762", "full_name", "_widget_1691239227137"],
    filter: {
      rel: "and",
      cond: [
        { field: "_widget_1701399332764", method: "ne", value: ["离职"] },
        { field: "_widget_1704997861762", method: "not_empty" },
      ],
    },
    limit: 100,
  });
};

export const saveExistInfo = async () => {
  const jdyInfos = await getJdyInfo();
  for (const jdyInfo of jdyInfos) {
    const userId = jdyInfo["_widget_1691239227137"];
    if (!(await User.findOneBy({ user_id: userId }))?.dahua_id) continue;
    const photo = jdyInfo["_widget_1704997861762"];
    const url = photo[0]["url"];
    const fileName = photo[0]["name"];
    const fileStream = await downloadFileStream(url);
    await addtoDahua({
      userId,
      name: jdyInfo["full_name"],
      fileStream,
      fileName,
    });
  }
};

export const updateExistInfo = async (data) => {
  const userId = data["_widget_1691239227137"];
  if (!!(await User.findOneBy({ user_id: userId }))?.dahua_id) return;
  const photo: any[] = data["_widget_1704997861762"];
  if (photo.length == 0) return;
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const fileStream = await downloadFileStream(url);
  await addtoDahua({
    userId,
    name: data["full_name"],
    fileStream,
    fileName,
  });
};

const saveNewInfotoDahua = async (data) => {
  const photo = data["_widget_1704998079070"];
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const fileStream = await downloadFileStream(url);
  await addtoDahua({
    userId: data["_widget_1720801227437"],
    name: data["full_name"],
    fileStream,
    fileName,
  });
};

export const addtoDahua = async ({ userId, name, fileStream, fileName }) => {
  let dir = "";
  if (fileStream) {
    dir = await fileApiClient.uploadFile(fileStream, fileName);
  }
  const dahuaPerson = await personApiClient.addPersonFile({
    name: name,
    facePhotoPath: dir,
  });
  if (dahuaPerson["success"]) {
    await User.addDahuaId(userId, dahuaPerson["data"]["personFileId"]);
    await personApiClient.authAsync(dahuaPerson["data"]["personFileId"]);
  }
  logger.info(`add person to dahua success: ${name}`);
};

export const addEmployeeToXft = async (data) => {
  await xftUserApiClient.saveEmployee({});
};

const generateData = (user) => {
  const staffBasicInfo = {
    stfType:
      user["company"] == "劳务派遣"
        ? "3"
        : entry_type[user["entry_type"]] ?? "",
    stfStatus:
      user["_widget_1701399332764"] == "在职"
        ? stfStatus[user["entry_type"]]
        : stfStatus[user["_widget_1701399332764"]] ?? "",
    // stfName: user["full_name"],
    mobileNumber: user["_widget_1679067663799"],
    certificateType: "A",
    certificateNumber: user["id_card_number"],
    sex: user["gender"] == "男" ? "0" : "1",
    nationality: "CN",
    // orgSeq: (orgs.find(
    //   (org) => org.code == user["_widget_1701228555030"]
    // ) ?? {
    //   id: "0000",
    // })["id"],
    stfNumber: user["_widget_1691239227137"].slice(0, 20),
    remark: "api_mod",
    birthday: formatDate(user["date_of_birth"]),
    hasMarried:
      user["marital_status"] == "未婚" || user["marital_status"] == "离异"
        ? "1"
        : "0",
    hasNurtured: user["marital_status"] == "已婚已育" ? "0" : "1",
    nation: nation[user["nation"]] ?? "",
    politicalAppearance: politicalAppearance[user["political_outlook"]] ?? "",
    certificateValidEndDate: formatDate(user["_widget_1679055409775"]),
    individualEmail: user["_widget_1679067663792"],
    workplaceLocationSeq:
      { 新前: "0000000001", 澄江: "0000000002", 江口: "0000000003" }[
        user["_widget_1691139170391"]
      ] ?? null,
    businessGroupSeq:
      {
        管理: "0000000001",
        研发: "0000000002",
        营销: "0000000003",
        生产管理: "0000000004",
        生产: "0000000005",
        后勤: "0000000006",
      }[user["_widget_1694939312263"]] ?? null,
    householdAddressProvince: user["home_details"]?.["province"],
    householdAddressCity: user["home_details"]?.["city"],
    householdAddressDistrict: user["home_details"]?.["district"],
    householdAddressDetail: user["home_details"]?.["detail"],
    presentAddressProvince: user["current_residential_address"]?.["province"],
    presentAddressCity: user["current_residential_address"]?.["city"],
    presentAddressDistrict: user["current_residential_address"]?.["district"],
    presentAddressDetail: user["current_residential_address"]?.["detail"],
    customerFieldInfoList: [
      FLD1100052[user["_widget_1694939312263"]] && {
        classKey: "S01BASIC",
        fieldKey: "FLD1100052",
        fieldValue: user["_widget_1694939312263"] ?? "",
      },
    ].filter((item) => item),
  };
  const staffWagesAndSocialSecurityInfo = {
    bankCardAccount: user["_widget_1690873684080"].split("、")[0],
    bankName: bankName[user["_widget_1690873684081"]] ?? "",
    customerFieldInfoList: [
      user["_widget_1691254640860"] !== "" && {
        classKey: "S04SAISR",
        fieldKey: "FLD1100059",
        fieldValue: user["_widget_1691254640860"] ?? "",
      },
    ].filter((item) => item !== false),
  };
  const staffHrmInfo = {
    entryDate: formatDate(user["_widget_1679067663828"]),
    actualPositiveDate: getLatestDate(
      user["_widget_1702230783034"]?.map(
        (data) => new Date(data["_widget_1702230783037"])
      )
    ),
    actualQuitDate:
      staffBasicInfo["stfStatus"] == "2"
        ? formatDate(user["_widget_1689753887996"])
        : "",
  };
  const staffEmergencyContact = {
    contactName: user["_widget_1679067663794"],
    contactTelephoneNumber: user["contact_number"],
    customerFieldInfoList: [
      user["_widget_1679067663795"] !== "" && {
        classKey: "S06EMCNT",
        fieldKey: "FLD1100051",
        fieldValue: user["_widget_1679067663795"] ?? "",
      },
      user["_widget_1679067663796"] !== "" && {
        classKey: "S06EMCNT",
        fieldKey: "FLD1100060",
        fieldValue: getAddress(user["_widget_1679067663796"]),
      },
    ].filter((item) => item !== false),
  };
  const staffEducationInfoList = user["_widget_1691418598886"].map((edu) => {
    return {
      graduateSchool: edu["_widget_1691418598887"],
      degree: edu["_widget_1691418598888"],
      specialty: edu["_widget_1691418598899"],
      graduateDate: formatDate(edu["_widget_1691418598901"]),
    };
  });
  // const staffFamilyMemberInfoList = user["_widget_1691418598884"].map((edu) => {
  //   return {
  //     relation: edu["_widget_1691418598887"],
  //     name: edu["_widget_1691418598890"],
  //     birthDate: edu["_widget_1691418598899"],
  //     currentWorkCompany: formatDate(edu["_widget_1691418598901"]),
  //     position: edu["_widget_1691418598899"],
  //     contactNumber: formatDate(edu["_widget_1691418598901"]),
  //   };
  // });
  return {
    staffBasicInfo: _.pickBy(staffBasicInfo, _.identity),
    staffWagesAndSocialSecurityInfo: _.pickBy(
      staffWagesAndSocialSecurityInfo,
      _.identity
    ),
    staffHrmInfo: _.pickBy(staffHrmInfo, _.identity),
    staffEmergencyContact: _.pickBy(staffEmergencyContact, _.identity),
    staffEducationInfoList: staffEducationInfoList,
  };
};

const entry_type = {
  试用: "0",
  正式: "0",
  退休返聘: "5",
  兼职: "1",
  实习: "2",
  挂靠: "1",
  顾问: "0",
  精一: "0",
  临时工: "7",
};
const stfStatus = {
  试用: "0",
  正式: "1",
  待离职: "",
  离职: "2",
};
const nation = {
  布依: "05",
  布依族: "05",
  朝鲜族: "06",
  侗: "11",
  侗族: "11",
  汉: "20",
  汉族: "20",
  回: "22",
  回族: "22",
  满: "31",
  满族: "31",
  苗: "35",
  苗族: "35",
  畲族: "42",
  畲: "42",
  水族: "43",
  瑶族: "52",
  瑶: "52",
  土家: "46",
  土家族: "46",
  傣: "08",
  彝族: "53",
  彝: "53",
};
const politicalAppearance = {
  团员: "0",
  党员: "1",
  预备党员: "4",
  群众: "2",
};
const FLD1100054 = {
  新前: "0",
  澄江: "1",
  江口: "2",
};
const FLD1100052 = {
  管理: "0",
  研发: "1",
  生产: "2",
  生产管理: "3",
  营销: "4",
  后勤: "5",
};
const bankName = {
  TZCB: "台州银行",
  ABC: "中国农业银行",
  ICBC: "中国工商银行",
  BOC: "中国银行",
  CIB: "兴业银行",
};

function getLatestDate(dates: Date[]): string {
  if (!dates || dates.length === 0) {
    return "";
  }
  return formatDate(dates.reduce((a, b) => (a > b ? a : b)).toISOString());
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从0开始，需要加1
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const getAddress = (address: any) => {
  if (!address) {
    return "";
  }
  const city =
    address?.["city"] == address?.["province"]
      ? address?.["city"]
      : address?.["province"] + address?.["city"];
  return city + address?.["district"] + address?.["detail"];
};
