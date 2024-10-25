import { xftatdApiClient } from "../../api/xft/xft_atd";
import { XftAtdClass } from "../../entity/atd/xft_class";

class AtdClassService {
  async updateAtdClass() {
    const atdClass = await xftatdApiClient.getClass();
    if (atdClass["returnCode"] != "SUC0000") return;
    for (const content of atdClass["body"])
      await XftAtdClass.create(content).save();
  }
  async getClassWorkTime(classSeq: string) {
    const atdClass = await XftAtdClass.findOne({ where: { classSeq } });
    if (!atdClass) return;
    const result = atdClass.classTimeDtos
      .filter((dto) => dto.classTimeType == "1")
      .map((dto) => dto.clockTime);
    return result;
  }
}
export const atdClassService = new AtdClassService();
