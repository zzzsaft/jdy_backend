import * as XLSX from "xlsx";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { JdyUtil } from "../../utils/jdyUtils";
import { addRandomMonths } from "../../utils/dateUtils";
import _ from "lodash";
import { Customer } from "../../entity/crm/customer";
class ReceiveService {
  appid = "5d7068edcdb5256f8f50978e";
  entryid = "680c8935b057f11fdbe51a5d";
  readAndGroupExcel(filePath) {
    // 1. 读取Excel文件
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[2];
    const worksheet = workbook.Sheets[firstSheetName];

    // 2. 将Excel数据转换为JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // 3. 按销售订单分组
    const groupedData = {};

    jsonData.forEach((row: any) => {
      const orderNo = row["销售订单"]; // 假设列名为"销售订单"
      if (row["项目负责人"] == "不需要验收单") return;
      if (!groupedData[orderNo]) {
        // 如果该订单不存在，创建新条目
        groupedData[orderNo] = {
          销售订单: orderNo,
          客户ID: row?.["客户ID"],
          客户描述: row["客户描述"],
          接单人员: row["接单人员"],
          项目负责人: row["项目负责人"],
          items: [
            {
              物料编号: row["物料编号"],
              描述: row["描述"],
              数量: row["发货数量"],
            },
          ], // 存储该订单下的所有项目
        };
      } else if (row["描述"] != "销售套件") {
        groupedData[orderNo].items.push({
          物料编号: row["物料编号"],
          描述: row["描述"],
        });
      }
      if (row["技术标准验收单编号及日期"]) {
        groupedData[orderNo]["等级"] = row["技术标准验收单编号及日期"];
      }
      if (row["发货时间"]) {
        groupedData[orderNo]["发货时间"] = new Date(row["发货时间"]);
      }
    });

    // 4. 转换为数组形式
    const resultList = Object.values(groupedData);

    return resultList;
  }
  addToJdy = async (data) => {
    const jdyData = data.map((item) => {
      return {
        _widget_1745662193134: JdyUtil.setText(`PAC-${item?.["销售订单"]}`),
        _widget_1745652021172: JdyUtil.setText(item?.["客户ID"]),
        _widget_1745652021173: JdyUtil.setText(item?.["客户描述"]),
        _widget_1745652021174: JdyUtil.setText(item?.["接单人员"]),
        _widget_1745652021175: JdyUtil.setText(item?.["项目负责人"]),
        _widget_1745652021184: JdyUtil.setDate(item?.["发货时间"]),
        _widget_1746596340705: JdyUtil.setText(item?.["等级"]),
        _widget_1745652021185: JdyUtil.setDate(
          addRandomMonths(item?.["发货时间"], item?.["等级"])
        ),
        _widget_1745652021187: JdyUtil.setText(
          item?.["items"]?.length > 1 ? "模头及配件" : ""
        ),
        _widget_1745652021176: JdyUtil.setText(item?.["销售订单"]),
        _widget_1745662456038: JdyUtil.setText(this.getNo(item)),
        _widget_1745652021178: JdyUtil.setSubForm(
          item?.["items"].map((i) => {
            return {
              _widget_1745652021181: JdyUtil.setText(i?.["物料编号"]),
              _widget_1745652021182: JdyUtil.setText(i?.["描述"]),
              _widget_1745652021183: JdyUtil.setNumber(i?.["数量"]),
            };
          })
        ),
      };
    });
    const jdy: any = _.chunk(jdyData, 100);
    for (const jdyData1 of jdy) {
      await jdyFormDataApiClient.batchDataCreate(
        this.appid,
        this.entryid,
        jdyData1
      );
    }
  };
  async processExcel() {
    // const result = this.readAndGroupExcel("./2024验收单取得情况5-5整理后.xlsx");
    const result = this.readAndGroupExcel("./2023验收单取得情况5-4整理后.xlsx");
    const cus = await Customer.find({ select: ["erpId", "type", "name"] });
    result.forEach((item: any) => {
      const customer = cus.find((c) => c.name == item?.["客户描述"]);
      item["客户ID"] = customer?.erpId;
      if (!item.等级) {
        const i = item.items.filter((i: any) => i.描述.includes("模头"));
        if (i.length == 0) {
          item.等级 = "A";
          return;
        }
        const j = i.filter(
          (i: any) =>
            i.描述.includes("共挤") ||
            i.描述.includes("双拉") ||
            i.描述.includes("涂布") ||
            i.描述.includes("涂覆")
        );
        if (j.length != 0) {
          item.等级 = "D";
          return;
        }
        if (customer?.type == "最终用户") {
          item.等级 = "C";
          return;
        }
        item.等级 = "B";
      }
    });
    const re1 = result.filter((re: any) => !re.等级);
    const re2 = result.filter((re: any) => !re.发货时间);
    await this.addToJdy(result);
    // console.log(result);
    return result;
  }

  getNo(data) {
    return data?.["items"]
      .map((i) => i.物料编号)
      .filter((j) => j.length == 6)
      .join(",");
  }
}
export const receiveService = new ReceiveService();
