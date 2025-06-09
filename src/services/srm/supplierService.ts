import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { CustomerInfo } from "../../entity/crm/customerInfo";
import { JdyUtil } from "../../utils/jdyUtils";
import { customerServices, provinces } from "../crm/customerService";

class SupplierService {
  appid = "5d95ac1333ae340007cdde4c";
  entryid = "668f81aec6834ee21f17c2ee";
  reviseJdy = async (dataId: string, info: CustomerInfo) => {
    await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      dataId,
      {
        _widget_1745607004015: JdyUtil.setText(info.tags),
        _widget_1745607004009: JdyUtil.setText(info.companyOrgType),
        _widget_1745607004001: JdyUtil.setText(info.alias),
        _widget_1745607004002: JdyUtil.setText(info.property3),
        _widget_1745607004003: JdyUtil.setText(info.creditCode),
        _widget_1745607004004: JdyUtil.setText(info.historyNames),
        _widget_1745607004005: JdyUtil.setText(info.industry),
        _widget_1745607004006: JdyUtil.setText(info.regStatus),
        _widget_1745607004007: JdyUtil.setText(info.regCapital),
        _widget_1745607004008: JdyUtil.setText(info.actualCapital),
        _widget_1745607004010: JdyUtil.setText(info.legalPersonName),
        _widget_1745607004012: JdyUtil.setDate(info.estiblishTime),
        _widget_1745607004011: JdyUtil.setText(info.socialStaffNum?.toString()),
        _widget_1745607004014: JdyUtil.setAddress({
          province: getProvinceFromAddress(info.regLocation),
          city: info.city,
          district: info.district,
          detail: info.regLocation,
        }),
        _widget_1745607004016: JdyUtil.setSubForm(
          info.staffList?.map((item) => {
            return {
              _widget_1745607004018: JdyUtil.setText(item.name),
              _widget_1745607004019: JdyUtil.setText(item.position?.join("，")),
            };
          })
        ),
      }
    );
  };
  updateJdy = async (id: string, name: string) => {
    let info = await CustomerInfo.findOne({ where: { name } });
    if (!info) {
      info = await customerServices.getCompanyInfo(name);
    }
    if (!info) return;
    await this.reviseJdy(id, info);
  };
  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        filter: {
          rel: "and",
          cond: [
            {
              field: "_widget_1744776026174",
              method: "not_empty",
            },
            {
              field: "_widget_1744776026174",
              method: "ne",
              value: ["重复"],
            },
            {
              field: "_widget_1745607004009",
              method: "empty",
            },
          ],
        },
        limit: 100,
      }
    );
    return result;
  };
  reviseAllJdy = async () => {
    const jdyData = await this.findJdy();
    for (const item of jdyData) {
      const dataId = item["_id"];
      const name = item["name"];
      const info = await CustomerInfo.findOne({ where: { name } });
      if (info) {
        await this.reviseJdy(dataId, info);
      } else {
        const info = await customerServices.getCompanyInfo(name);
        if (!info) continue;
        await this.reviseJdy(dataId, info);
      }
    }
  };
}

function getProvinceFromAddress(address: string): string {
  for (const province of provinces) {
    if (address.includes(province)) {
      return province;
    }
    if (address.includes("汕头")) return "广东省";
  }
  return ""; // 未找到匹配的省份
}

export const supplierService = new SupplierService();
