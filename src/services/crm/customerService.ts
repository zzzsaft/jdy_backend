import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { tycApiClient } from "../../api/tianyacha/app";
import { Log } from "../../entity/log/log";
import { CustomerInfo } from "../../entity/crm/customerInfo";
import { JdyUtil } from "../../utils/jdyUtils";
import { Customer } from "../../entity/crm/customer";
import { Like } from "typeorm";
import _ from "lodash";
import { jsontoSheet } from "../../utils/excelUtils";

export const provinces = [
  "北京市",
  "天津市",
  "上海市",
  "重庆市",
  "河北省",
  "山西省",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "海南省",
  "四川省",
  "贵州省",
  "云南省",
  "陕西省",
  "甘肃省",
  "青海省",
  "台湾省",
  "内蒙古自治区",
  "广西壮族自治区",
  "西藏自治区",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "香港特别行政区",
  "澳门特别行政区",
];

class CustomerServices {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "020100200000000000000001";
  async getCompanyInfo(name) {
    const flag = await this.isExist(name);
    if (flag) {
      return;
    }
    const result = await tycApiClient.baseInfo(name);
    if (result?.error_code != 0) {
      // throw new Error(
      //   `请求错误！Error Code: ${result.error_code}, Error Msg: ${result.reason}`
      // );
      return null;
    }
    const info = result["result"];
    await Log.create({ level: "info", message: JSON.stringify(info) }).save();
    return await this.addToDb(info);
  }
  private isExist = async (name: string) => {
    return await CustomerInfo.exists({ where: { name } });
  };
  addToDb = async (info: any) => {
    info.fromTime = new Date(info.fromTime);
    info.type = info.type === 1 ? "人" : "公司";
    info.isMicroEnt = info.isMicroEnt === 1 ? "是" : "否";
    info.approvedTime = new Date(info.approvedTime) ?? null;
    info.updateTimes = new Date(info.updateTimes) ?? null;
    info.estiblishTime = new Date(info.estiblishTime) ?? null;
    info.toTime = new Date(info.toTime) ?? null;
    info.revokeDate = new Date(info.revokeDate) ?? null;
    info.cancelDate = new Date(info.cancelDate) ?? null;
    info.staffList = info.staffList?.result.map((item) => {
      return {
        id: item.id,
        name: item.name,
        position: item.typeJoin,
        type: item.type == 1 ? "公司" : "人",
      };
    });
    info.category = info?.industryAll?.category;
    info.categoryBig = info?.industryAll?.categoryBig;
    info.categoryMiddle = info?.industryAll?.categoryMiddle;
    info.categorySmall = info?.industryAll?.categorySmall;
    const tycInfo = CustomerInfo.create(info);
    await CustomerInfo.upsert(tycInfo, ["id"]);
    return tycInfo;
  };
  reviseJdytoNull = async (dataId: string) => {
    await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      dataId,
      { _widget_1630862543415: JdyUtil.setText("公司名错误") }
    );
  };

  reviseJdy = async (dataId: string, info: CustomerInfo) => {
    await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      dataId,
      {
        _widget_1740907087777: JdyUtil.setText(info?.tags),
        _widget_1740674945172: JdyUtil.setText(info?.companyOrgType),
        _widget_1740847721781: JdyUtil.setText(info?.alias),
        _widget_1740765309710: JdyUtil.setText(info?.property3),
        _widget_1740765309552: JdyUtil.setText(info?.creditCode),
        _widget_1740765309597: JdyUtil.setText(info?.historyNames),
        _widget_1740765309687: JdyUtil.setText(info?.industry),
        _widget_1740674945175: JdyUtil.setText(info?.regStatus),
        _widget_1740674945171: JdyUtil.setText(info?.regCapital),
        _widget_1740765309675: JdyUtil.setText(info?.actualCapital),
        _widget_1740674945173: JdyUtil.setText(info?.legalPersonName),
        _widget_1740674945176: JdyUtil.setDate(info?.estiblishTime),
        _widget_1738822013957: JdyUtil.setText(info?.city),
        _widget_1740463527286: JdyUtil.setText(info?.district),
        _widget_1740844398161: JdyUtil.setText(
          info?.socialStaffNum?.toString()
        ),
        _widget_1740848672029: JdyUtil.setAddress({
          province: getProvinceFromAddress(info.regLocation),
          city: info.city,
          district: info.district,
          detail: info.regLocation,
        }),
        _widget_1740765309525: JdyUtil.setSubForm(
          info.staffList?.map((item) => {
            return {
              _widget_1740765309527: JdyUtil.setText(item.name),
              _widget_1740765309528: JdyUtil.setText(item.position?.join("，")),
            };
          })
        ),
        _widget_1631071964899: JdyUtil.setText(info.websiteList),
        _widget_1631071964742: JdyUtil.setText(info.phoneNumber),
        _widget_1740765309551: JdyUtil.setText(info.email),
      }
    );
  };

  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        // fields: ["account_name",'_widget_1747163314182'],
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1630862543415",
              method: "nin",
              value: ["废弃", "注销客户"],
            },
            // {
            //   field: "_widget_1740765309552",
            //   method: "empty",
            //   // value: [""],
            // },
            // {
            //   field: "_widget_1630862543434",
            //   method: "ne",
            //   value: ["其他非销售资源池"],
            // },
            // {
            //   field: "_widget_1740442384783",
            //   method: "nin",
            //   value: ["学院大学", "个人用户"],
            // },
            // {
            //   field: "_widget_1738822013958",
            //   method: "eq",
            //   value: ["中国"],
            // },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };
  findJdyByName = async (name: string) => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1630862543415",
              method: "nin",
              value: ["废弃", "注销客户"],
            },
            {
              field: "account_name",
              method: "eq",
              value: [name],
            },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };
  findJdyError = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        fields: ["updater", "account_name", "_widget_1740442384783"],
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1630862543415",
              method: "eq",
              value: ["公司名错误"],
            },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };

  updateJdy = async (id: string, name: string) => {
    let info = await CustomerInfo.findOne({ where: { name } });
    if (!info) {
      info = await this.getCompanyInfo(name);
    }
    if (!info) return;
    await this.reviseJdy(id, info);
  };

  reviseAllJdy = async () => {
    const jdyData = await this.findJdy();
    for (const item of jdyData) {
      const dataId = item["_id"];
      const name = item["account_name"];
      if (startsWithLetter(name)) continue;
      if (name.includes("台湾")) continue;
      const info = await CustomerInfo.findOne({ where: { name } });
      if (info) {
        await this.reviseJdy(dataId, info);
      } else {
        const info = await this.getCompanyInfo(name);
        if (!info) {
          await this.reviseJdytoNull(dataId);
          continue;
        }
        await this.reviseJdy(dataId, info);
      }
    }
  };

  addToDbfromLog = async (logid: number) => {
    const log = await Log.findOne({ where: { id: logid } });
    if (!log) return;
    const info = JSON.parse(log.message);
    return await this.addToDb(info);
  };

  mapping = (item: any) => {
    return Customer.create({
      name: item["account_name"],
      jdyId: item["_id"],
      chargerId: JdyUtil.getUser(item["charger"])?.username,
      charger: JdyUtil.getUser(item["charger"])?.name,
      erpId: item["account_no"],
      collaboratorId:
        JdyUtil.getUsers(item["collaborator"])?.map((item) => item.username) ??
        [],
      collaborator:
        JdyUtil.getUsers(item["collaborator"])?.map((item) => item.name) ?? [],
      type: item["_widget_1740442384783"],
      industry: item["_widget_1738903869208"],
      product: item["_widget_1738822013985"],
      supporter: JdyUtil.getUser(item["_widget_1747163314182"])?.name,
      supporterId: JdyUtil.getUser(item["_widget_1747163314182"])?.username,
      address: JdyUtil.getAddress(item["_widget_1741238297449"])?.full,
    });
  };

  addAlltoDb = async () => {
    const data = await this.findJdy();
    const c: any[] = [];
    for (const item of data) {
      const cus = this.mapping(item);
      c.push(cus);
    }
    const chunks = _.chunk(c, 1000);
    for (const chunk of chunks) {
      await Customer.upsert(chunk, {
        conflictPaths: ["jdyId"],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  };

  upsertToDb = async (data: any) => {
    await Customer.upsert(this.mapping(data), {
      conflictPaths: ["jdyId"],
      skipUpdateIfNoValuesChanged: true,
    });
  };

  findCompany = async (name: string) => {
    const cus = await Customer.find({
      where: { name: Like(`%${name}%`) },
      take: 10,
    });
    return cus.map((item) => {
      return { name: item["name"], id: item["jdyId"], erpId: item["erpId"] };
    });
  };

  count = async () => {
    const info: any[] = await this.findJdyError();
    const count = _.countBy(info.map((i) => i?.updater?.name));
    jsontoSheet(
      info.map((i) => {
        return {
          id: i._id,
          name: i.account_name,
          updater: i?.updater?.name,
          客户类型: i._widget_1740442384783,
        };
      })
    );
    delete count["梁之"];
    console.log(count);
  };
  insertCustomerByName = async (name: string) => {
    const cus = await Customer.findOne({ where: { name } });
    if (cus) return cus;
    const data = await this.findJdyByName(name);
    if (data.length != 1) return null;
    return await Customer.save(this.mapping(data[0]));
  };
  setCharger = async (name, charger: { userid; username }) => {
    const cus = await this.insertCustomerByName(name);
    if (!cus || cus.chargerId) return;
    cus.chargerId = charger.userid;
    cus.charger = charger.username;
    const result = await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      cus.jdyId,
      {
        charger: JdyUtil.setText(charger.userid),
      }
    );
    if (result?.["data"]) await cus.save();
  };

  setCollaborator = async (erpId, userid) => {
    const cus = await Customer.findOne({
      where: { erpId },
      select: ["collaboratorId", "jdyId"],
    });
    if (!cus) return;
    if (!cus?.collaboratorId?.includes(userid)) {
      cus.collaboratorId.push(userid);
      await jdyFormDataApiClient.singleDataUpdate(
        this.appid,
        this.entryid,
        cus.jdyId,
        {
          collaborator: JdyUtil.setCombos(cus.collaboratorId),
        }
      );
      await Customer.update({ erpId }, { collaboratorId: cus.collaboratorId });
    }
  };

  setSupport = async (name, support: { userid; name }) => {
    const cus = await this.insertCustomerByName(name);
    if (!cus) return;
    cus.supporterId = support.userid;
    cus.supporter = support.name;
    const result = await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      cus.jdyId,
      {
        _widget_1747163314182: JdyUtil.setText(support.userid),
        _widget_1749240607554: JdyUtil.setText("已更换支持"),
      }
    );
    if (result?.["data"]) await cus.save();
  };
}

export const customerServices = new CustomerServices();

function getProvinceFromAddress(address: string): string {
  for (const province of provinces) {
    if (address.includes(province)) {
      return province;
    }
    if (address.includes("汕头")) return "广东省";
  }
  return ""; // 未找到匹配的省份
}
function startsWithLetter(str) {
  return /^[a-zA-Z]/.test(str);
}
