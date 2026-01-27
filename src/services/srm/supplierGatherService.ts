import { CustomerInfo } from "../../entity/crm/customerInfo";
import { jdyFormDataApiClient } from "../../features/jdy/api/form_data";
import { JdyUtil } from "../../utils/jdyUtils";
import { customerServices, provinces } from "../crm/customerService";

class SupplierGatherService {
  appid = "5d95ac1333ae340007cdde4c";
  entryid = "67ff3c56c9407007ddfb8f11";
  reviseJdy = async (dataId: string, info: CustomerInfo) => {
    await jdyFormDataApiClient.singleDataUpdate(
      this.appid,
      this.entryid,
      dataId,
      {
        _widget_1745610194077: JdyUtil.setText(info.tags),
        _widget_1745610194071: JdyUtil.setText(info.companyOrgType),
        _widget_1745610194063: JdyUtil.setText(info.alias),
        _widget_1745610194064: JdyUtil.setText(info.property3),
        _widget_1745610194065: JdyUtil.setText(info.creditCode),
        _widget_1745610194066: JdyUtil.setText(info.historyNames),
        _widget_1745610194067: JdyUtil.setText(info.industry),
        _widget_1745610194068: JdyUtil.setText(info.regStatus),
        _widget_1745610194069: JdyUtil.setText(info.regCapital),
        _widget_1745610194070: JdyUtil.setText(info.actualCapital),
        _widget_1745610194072: JdyUtil.setText(info.legalPersonName),
        _widget_1745610194074: JdyUtil.setDate(info.estiblishTime),
        _widget_1745610194073: JdyUtil.setText(info.socialStaffNum?.toString()),
        _widget_1745610194076: JdyUtil.setAddress({
          province: getProvinceFromAddress(info.regLocation),
          city: info.city,
          district: info.district,
          detail: info.regLocation,
        }),
        _widget_1745610194078: JdyUtil.setSubForm(
          info.staffList?.map((item) => {
            return {
              _widget_1745610194080: JdyUtil.setText(item.name),
              _widget_1745610194081: JdyUtil.setText(item.position?.join("，")),
            };
          })
        ),
      }
    );
  };
  updateJdy = async (id: string, name: string) => {
    if (!name) return;
    let info = await CustomerInfo.findOne({ where: { name } });
    if (!info) {
      info = await customerServices.getCompanyInfo(name);
    }
    if (!info) return;
    await this.reviseJdy(id, info);
  };
  trigger = async (appid: string, entryid, op, data) => {
    if (appid !== this.appid || entryid !== this.entryid) return;
    if (data?.["_widget_1745610194077"]) return;
    await this.updateJdy(data._id, data._widget_1550470841596);
  };
  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        filter: {
          rel: "and",
          cond: [
            // {
            //   field: "_widget_1745610194077",
            //   method: "empty",
            // },
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
      const name = item["_widget_1550470841596"];
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

export const supplierGatherService = new SupplierGatherService();
