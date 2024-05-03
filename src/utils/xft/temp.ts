import { Department } from "../../entity/wechat/Department";
import { IDataQueryOption } from "../../type/jdy/IOptions";
import { formDataApiClient } from "../jdy/form_data";
import { xftOrgnizationApiClient } from "./orgnization";
import crypto from "crypto";
import nodeRSA from "node-rsa";
import { xftUserApiClient } from "./xft_user";
import _ from "lodash";
export const importDepartmentToXft = async () => {
  const departments = await Department.find({ where: { is_exist: true } });
  const datas = departments
    .map((department) => {
      let parent_id = department.parent_id.toString();
      if (parent_id === "1") {
        parent_id = "root";
      }
      return {
        name: department.name,
        id: department.department_id.toString(),
        parent_id: parent_id,
        leader: "",
      };
    })
    .filter((department) => department.id !== "1");
  await xftOrgnizationApiClient.importOrgnization(datas);
};

export const testRSA = () => {
  //   const key = new nodeRSA({ b: 1024 });
  const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
  const key = new nodeRSA(`-----BEGIN RSA PRIVATE KEY-----
    ${RSA_PRIVATE_KEY}
    -----END RSA PRIVATE KEY-----`);

  // 导出公钥
  const publicKey = key.exportKey("public");
  const userInfo = {
    userid: "LiangZhi",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const secret = encrypt(publicKey, Buffer.from(JSON.stringify(userInfo)));
  console.log(secret);
};

function encrypt(publicKey: any, plaintext: Buffer): string {
  return crypto
    .publicEncrypt(
      {
        key: Buffer.from(publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      plaintext
    )
    .toString("base64");
}

const getUserList = async () => {
  const { appid, entryid } = formDataApiClient.getFormId("员工档案");
  const option: IDataQueryOption = {
    limit: 99,
  };
  return await formDataApiClient.batchDataQuery(appid, entryid, option);
};
export const importJdyToXft = async () => {
  // 获取xft数据
  const exist_users = (await xftUserApiClient.getEmployeeList())["body"][
    "records"
  ].map((record) => record.staffBasicInfo.certificateNumber);
  const orgs = (await xftOrgnizationApiClient.getOrgnizationList())["body"][
    "records"
  ].filter((record) => record.status === "active");
  // 获取简道云数据
  let users = await getUserList();
  users = users.filter(
    (user: any) =>
      !exist_users.includes(user.id_card_number) &&
      [
        "浙江精诚模具机械有限公司",
        "精诚时代（台州）进出口有限公司",
        "劳务派遣",
      ].includes(user["company"]) &&
      user.id_card_number != ""
  );
  let result = users.map((user) => {
    const staffBasicInfo = {
      stfType:
        user["company"] == "劳务派遣"
          ? 3
          : entry_type[user["entry_type"]] ?? "",
      stfStatus:
        user["_widget_1701399332764"] == "在职"
          ? stfStatus[user["entry_type"]]
          : stfStatus[user["_widget_1701399332764"]] ?? "",
      stfName: user["full_name"],
      mobileNumber: user["_widget_1679067663799"],
      certificateType: "A",
      certificateNumber: user["id_card_number"],
      sex: user["gender"] == "男" ? "0" : "1",
      nationality: "CN",
      orgSeq: (
        orgs.find((org) => org.code == user["_widget_1701228555030"]) ?? {
          id: "0000",
        }
      ).id,
      stfNumber: user["_widget_1691239227137"],
      remark: "api",
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
      customerFieldInfoList: [
        FLD1100054[user["_widget_1691139170391"]] && {
          classKey: "S01BASIC",
          fieldKey: "FLD1100054",
          fieldValue: FLD1100054[user["_widget_1691139170391"]] ?? "",
        },
        FLD1100052[user["_widget_1694939312263"]] && {
          classKey: "S01BASIC",
          fieldKey: "FLD1100052",
          fieldValue: FLD1100052[user["_widget_1694939312263"]] ?? "",
        },
      ].filter((item) => item !== false),
    };
    const staffWagesAndSocialSecurityInfo = {
      bankCardAccount: user["_widget_1690873684080"],
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
      actualQuitDate: formatDate(user["_widget_1689753887996"]),
    };
    return {
      staffBasicInfo: _.pickBy(staffBasicInfo, _.identity),
      staffWagesAndSocialSecurityInfo: _.pickBy(
        staffWagesAndSocialSecurityInfo,
        _.identity
      ),
      staffHrmInfo: _.pickBy(staffHrmInfo, _.identity),
    };
  });
  const chunkedList = _.chunk(result, 1000);
  // console.log(chunkedList[0]);
  for (let i = 0; i < chunkedList.length; i++) {
    console.log(await xftUserApiClient.createEmployeeList(chunkedList[i]));
  }
  // console.log(result);
  // console.log(formatDate("2017-10-20T22:41:51.430Z"));
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
  待离职: "3",
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
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从0开始，需要加1
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
