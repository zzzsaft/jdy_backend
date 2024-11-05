import _ from "lodash";
import { logger } from "../../config/logger";
import { User } from "../../entity/basic/employee";
import { fileApiClient } from "../../api/dahua/file";
import { personApiClient } from "../../api/dahua/person";
import { downloadFileStream } from "../../utils/fileUtils";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { xftUserApiClient } from "../../api/xft/xft_user";
import { xftOrgnizationApiClient } from "../../api/xft/xft_orgnization";
import { Department } from "../../entity/basic/department";
import { EmployeeLifecycle } from "../../entity/basic/employee_lifecycle";
import { SalaryRecord } from "../../entity/basic/salary-record";
import { dahuaServices } from "../../services/dahuaServices";

export const 入职申请表 = async (data) => {
  await saveNewInfotoDahua(data);
  await addEmployeeToXft(data);
  await SalaryRecord.addRecord({
    userid: data["_widget_1720801227437"],
    probation: data.salary_during_probation_period,
    positive: data._widget_1705741401338,
  });
  await addToDb(data);
};

const getJdyInfo = async () => {
  const id = jdyFormDataApiClient.getFormId("员工档案");
  return await jdyFormDataApiClient.batchDataQuery(id.appid, id.entryid, {
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
    await dahuaServices.addtoDahua({
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
  await dahuaServices.addtoDahua({
    userId,
    name: data["full_name"],
    fileStream,
    fileName,
  });
};

const saveNewInfotoDahua = async (data) => {
  let userId = data["_widget_1720801227437"];
  if (!(await User.findOneBy({ user_id: userId }))?.dahua_id) return;
  const photo = data["_widget_1704998079070"];
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const fileStream = await downloadFileStream(url);
  await dahuaServices.addtoDahua({
    userId,
    name: data["full_name"],
    fileStream,
    fileName,
  });
};

export const addEmployeeToXft = async (data) => {
  return await xftUserApiClient.saveEmployee([
    {
      sequence: data["_widget_1720801227437"],
      staffBasicInfo: await staffBasicInfo(data),
      staffHrmInfo: staffHrmInfo(data),
      staffEmergencyContact: staffEmergencyContact(data),
    },
  ]);
};

const staffBasicInfo = async (user) => {
  const orgs = await Department.find();
  const basicInfo = {
    mobileNumber: user["contact_number"],
    orgSeq: (
      orgs.find(
        (org) => org.department_id == user["_widget_1702572867837"]
      ) ?? {
        xft_id: "0000",
      }
    ).xft_id,
    remark: "来源人事OA入职申请",
    stfName: user["full_name"],
    stfNumber: user["_widget_1720801227437"].slice(0, 20),
    workplaceLocationSeq:
      { 新前: "0000000001", 澄江: "0000000002", 江口: "0000000003" }[
        user["company"]
      ] ?? null,
    stfStatus: stfStatus[user["_widget_1723706930226"]],
    stfType: entry_type[user["entry_type"]],
    birthday: formatDate(user["date_of_birth"]),
    certificateType: "P01",
    certificateNumber: user["id_card_number"],
    sex: user["gender"] == "男" ? "0" : "1",
    nationality: "CN",

    hasMarried:
      user["marital_status"] == "未婚" || user["marital_status"] == "离异"
        ? "1"
        : "0",
    hasNurtured: user["marital_status"] == "已婚已育" ? "0" : "1",
    nation: nation[user["nation"]] ?? "",
    politicalAppearance: politicalAppearance[user["political_outlook"]] ?? "",
    certificateValidEndDate: formatDate(user["_widget_1680479931897"]),
    individualEmail: user["_widget_1679067663792"],

    businessGroupSeq:
      {
        管理: "0000000001",
        研发: "0000000002",
        销售: "0000000003",
        生产管理: "0000000004",
        生产: "0000000005",
        后勤: "0000000006",
      }[user["_widget_1695897616435"]] ?? null,
    householdAddressProvince: user["home_details"]?.["province"],
    householdAddressCity: user["home_details"]?.["city"],
    householdAddressDistrict: user["home_details"]?.["district"],
    householdAddressDetail: user["home_details"]?.["detail"],
    presentAddressProvince: user["current_residential_address"]?.["province"],
    presentAddressCity: user["current_residential_address"]?.["city"],
    presentAddressDistrict: user["current_residential_address"]?.["district"],
    presentAddressDetail: user["current_residential_address"]?.["detail"],
    contactAddressProvince: user["home_details"]?.["province"],
    contactAddressCity: user["home_details"]?.["city"],
    contactAddressDistrict: user["home_details"]?.["district"],
    contactAddressDetail: user["home_details"]?.["detail"],
    staffCustomerFieldInfoList: [
      FLD1100052[user["_widget_1695897616435"]] && {
        classKey: "S01BASIC",
        fieldKey: "FLD1100052",
        fieldValue: user["_widget_1695897616435"] ?? "",
      },
    ].filter((item) => item),
  };
  return _.pickBy(basicInfo, _.identity);
};

const staffHrmInfo = (user) => {
  const hrmInfo = {
    planPositiveDate: formatDate(user["time_of_becoming_a_regular_worker"]),
    entryDate: formatDate(user["entry_time"]),
  };
  return _.pickBy(hrmInfo, _.identity);
};

const staffEmergencyContact = (user) => {
  const emergencyContact = {
    contactName: user["_widget_1679070424640"],
    contactTelephoneNumber: user["_widget_1679070424641"],
    staffCustomerFieldInfoList: [
      {
        classKey: "S06EMCNT",
        fieldKey: "FLD1100051",
        fieldValue: user["_widget_1679070424642"] ?? "",
      },
    ].filter((item) => item),
  };
  return _.pickBy(emergencyContact, _.identity);
};

const entry_type = {
  全职: "0",
  兼职: "1",
  实习: "2",
  劳务派遣: "3",
  外包: "4",
  退休返聘: "5",
  其他: "6",
};
const stfStatus = {
  试用: "0",
  正式: "1",
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

const addToDb = async (user) => {
  const life = EmployeeLifecycle.create({
    name: user["full_name"],
    userid: user["_widget_1720801227437"],
    certificateId: user["id_card_number"],
    actualDate: formatDate(user["entry_time"]),
    departmentId: user["_widget_1702572867837"],
    type: "入职",
  });
  await EmployeeLifecycle.add(life);
};
