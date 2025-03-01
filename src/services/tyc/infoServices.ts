import { tycApiClient } from "../../api/tianyacha/app";
import { Log } from "../../entity/log/log";
import { TycInfo } from "../../entity/tyc/tycInfo";

class InfoServices {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "020100200000000000000001";
  async getCompanyInfo(name) {
    const flag = await this.isExist(name);
    if (flag) {
      return;
    }
    const result = await tycApiClient.baseInfo(name);
    if (result?.error_code != 0) {
      throw new Error(
        `请求错误！Error Code: ${result.error_code}, Error Msg: ${result.reason}`
      );
    }
    const info = result["result"];
    await Log.create({ level: "info", message: JSON.stringify(info) }).save();
    await this.addToDb(info);
  }
  private isExist = async (name: string) => {
    return await TycInfo.exists({ where: { name } });
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
    info.staffList = info.staffList.result.map((item) => {
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
    const tycInfo = TycInfo.create(info);
    await TycInfo.upsert(tycInfo, ["id"]);
  };
}
export const infoServices = new InfoServices();
