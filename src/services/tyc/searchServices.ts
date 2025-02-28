import { values } from "lodash";
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { tycApiClient } from "../../api/tianyacha/app";
import { TycSearch } from "../../entity/tyc/tycSearch";
import { JdyUtil } from "../../utils/jdyUtils";

const companyType = {
  1: "公司",
  2: "香港企业",
  3: "社会组织",
  4: "律所",
  5: "事业单位",
  6: "基金会",
  7: "不存在法人、注册资本、统一社会信用代码、经营状态",
  8: "台湾企业",
  9: "新机构",
};

class SearchServices {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "67c08f7645dc14714c6440a0";
  keyWord: string;
  async searchCompany(keyword: string) {
    this.keyWord = keyword;
    const flag = await this.isExist(keyword);
    if (flag) {
      return;
    }
    const result = await tycApiClient.search(keyword);
    if (result?.error_code != 0) {
      throw new Error(
        `请求错误！Error Code: ${result.error_code}, Error Msg: ${result.reason}`
      );
    }
    const dbData = await this.addToDb(result["result"]);
    await this.addToJdy(dbData);
  }
  private isExist = async (keyword: string) => {
    return await TycSearch.exists({ where: { keyWord: keyword } });
  };
  private addToDb = async (items: any) => {
    const data: TycSearch[] = [];
    for (const item of items.items) {
      item.estiblishTime = new Date(item.estiblishTime);
      item.type = item.type === 1 ? "公司" : "个体户";
      item.companyType = companyType?.[item.companyType] ?? "";
      item.company_id = item.id;
      item.keyWord = this.keyWord;
      delete item.id;
      const search = TycSearch.create(item);
      data.push(search);
    }
    return await TycSearch.save(data);
  };
  addToJdy = async (data: TycSearch[]) => {
    if (await this.findJdy(this.keyWord)) {
      return;
    }
    const jdyData = data.map((item) => {
      return {
        _widget_1740672886761: { value: item.keyWord },
        _widget_1740672886762: { value: item.name },
        _widget_1740672886763: { value: item.regCapital },
        _widget_1740672886764: { value: item.companyType },
        _widget_1740672886765: { value: item.legalPersonName },
        _widget_1740672886766: { value: item.base },
        _widget_1740672886767: { value: item.regStatus },
        _widget_1740672886769: JdyUtil.setDate(item.estiblishTime),
        _widget_1740679082378: JdyUtil.setNumber(
          parseInt(item.regCapital) ?? 0
        ),
      };
    });
    await jdyFormDataApiClient.batchDataCreate(
      this.appid,
      this.entryid,
      jdyData
    );
  };
  private findJdy = async (keyword: string) => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      {
        filter: {
          rel: "and",
          cond: [
            { field: "_widget_1740672886761", method: "eq", value: [keyword] },
          ],
        },
      }
    );
    return result?.length > 0;
  };
  testAddToJdy = async (keyWord) => {
    this.keyWord = keyWord;
    const data = await TycSearch.find({ where: { keyWord: keyWord } });
    const flag = await this.findJdy(keyWord);
    if (data && !flag) {
      await this.addToJdy(data);
    }
  };
}

export const searchServices = new SearchServices();
