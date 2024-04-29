import { Department } from "../../entity/wechat/Department";
import { orgnizationApiClient } from "./orgnization";
import crypto from "crypto";
import nodeRSA from "node-rsa";

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
  await orgnizationApiClient.importOrgnization(datas);
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
