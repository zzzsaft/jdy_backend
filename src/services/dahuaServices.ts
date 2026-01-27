import { IsNull, Not } from "typeorm";
import { personApiClient } from "../api/dahua/person";
import { User } from "../entity/basic/employee";
import { fileApiClient } from "../api/dahua/file";
import { logger } from "../config/logger";
import { compressImage, downloadFileStream } from "../utils/fileUtils";
import { sleep } from "../config/limiter";
import { jdyFormDataApiClient } from "../features/jdy/api/form_data";

class DahuaServices {
  async deleteDahuaId() {
    const ids = (await personApiClient.getPersonInfo()).map((a) => a["id"]);
    const users = (await User.find({ where: { dahua_id: Not(IsNull()) } })).map(
      (a) => a.dahua_id
    );
    for (const id of ids) {
      if (!users.includes(id)) {
        await personApiClient.deletePerson(id);
      }
    }
  }
  async addtoDahua({ userId, fileStream, fileName, name = "" }) {
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user) {
      logger.error(`user not found: ${userId}`);
      return;
    }
    if (user.dahua_id) return;
    let dir = "";
    if (fileStream) {
      dir = await fileApiClient.uploadFile(fileStream, fileName);
    }
    const dahuaPerson = await personApiClient.addPersonFile({
      name: user.name,
      facePhotoPath: dir,
    });
    if (dahuaPerson["success"]) {
      user.dahua_id = dahuaPerson["data"]["personFileId"];
      user.photoName = fileName;
      await user.save();
      await personApiClient.authAsync(dahuaPerson["data"]["personFileId"]);
    }
    logger.info(`add person to dahua success: ${name}`);
  }
  async updateDahua({ userId, fileStream, fileName }) {
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user) {
      logger.error(`user not found: ${userId}`);
      return;
    }
    if (!user.dahua_id) {
      await this.addtoDahua({ userId, fileStream, fileName });
      return;
    }
    if (user.photoName == fileName) return;
    let dir = "";
    if (fileStream) {
      let newStream = await compressImage(fileStream);
      dir = await fileApiClient.uploadFile(newStream, fileName);
    }
    const dahuaPerson = await personApiClient.updatePersonFile({
      id: user.dahua_id,
      name: user.name,
      facePhotoPath: dir,
    });
    if (dahuaPerson["success"]) {
      user.photoName = fileName;
      await user.save();
    }
  }
}

export const dahuaServices = new DahuaServices();

const 获取员工档案 = async () => {
  const app = jdyFormDataApiClient.getFormId("员工档案");
  return await jdyFormDataApiClient.batchDataQuery(app.appid, app.entryid, {
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

export const updateDahua = async () => {
  const data = await 获取员工档案();
  for (const jdyInfo of data) {
    await updateExistInfo(jdyInfo);
    sleep(500);
  }
};
export const updateExistInfo = async (data) => {
  const userId = data["_widget_1691239227137"];
  if (!userId) return;
  const photo: any[] = data["_widget_1704997861762"];
  if (photo.length == 0) return;
  const url = photo[0]["url"];
  const fileName = photo[0]["name"];
  const user = await User.findOne({ where: { user_id: userId } });
  if (!user) {
    logger.error(`user not found: ${userId}`);
    return;
  }
  user.bank = data?.["_widget_1690873684141"];
  user.bankAccount = data?.["_widget_1690873684080"];
  await user.save();
  if (user.photoName == fileName) return;
  const fileStream = await downloadFileStream(url);
  await dahuaServices.updateDahua({
    userId,
    fileStream,
    fileName,
  });
};
export const deleteDahuaId = async () => {
  const ids = (await personApiClient.getPersonInfo()).map((a) => a["id"]);
  const users = (await User.find({ where: { dahua_id: Not(IsNull()) } })).map(
    (a) => a.dahua_id
  );
  for (const id of ids) {
    if (!users.includes(id)) {
      await personApiClient.deletePerson(id);
    }
  }
};
