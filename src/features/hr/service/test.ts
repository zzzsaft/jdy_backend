import "../../../config/env.js";
import "../../../config/logger.js";

import "reflect-metadata";
import { BaseEntity } from "typeorm";
import { PgDataSource } from "../../../config/data-source.js";
import { hrContractService } from "./hrContractService.js";
import { logger } from "../../../config/logger.js";

/**
 * Dev helper to replay a JDY `data_update` payload into HrContractService.handleUpdate().
 *
 * Run:
 *   node -r dotenv/config -r ts-node/register --openssl-legacy-provider src/features/hr/service/test.ts
 */
export async function main() {
  await PgDataSource.initialize();
  BaseEntity.useDataSource(PgDataSource);

  // JDY webhook sample (data_update) - electronic contract signing form.
  const payload = {
    op: "data_update",
    opTime: 1778575509018,
    data: {
      _id: "69d8ab62d78c62093e724f25",
      _widget_1690006804666: {},
      _widget_1690006804667: "周琼奇",
      _widget_1690006804668: "331003200206230526",
      _widget_1690006804669: {
        city: "台州市",
        detail: "浙江省台州市黄岩区宁溪镇春福东路115号",
        district: "黄岩区",
        province: "浙江省",
      },
      _widget_1690006804670: {
        city: "",
        detail: "浙江省台州市黄岩区宁溪镇春福东路115号",
        district: "",
        province: "",
      },
      _widget_1690006804671: "周慧奇",
      _widget_1690006804672: "姐妹",
      _widget_1690006804673: "18868639623",
      _widget_1690006804674: {
        city: "",
        detail: "浙江省台州市黄岩区宁溪镇春福东路115号",
        district: "",
        province: "",
      },
      _widget_1690006804675: "无",
      _widget_1690006804676: "18806579532",
      _widget_1690006804679: "A",
      _widget_1690006804681: "2025-10-03T16:00:00.000Z",
      _widget_1690006804682: "2026-01-01T16:00:00.000Z",
      _widget_1690006804683: null,
      _widget_1690006804684: null,
      _widget_1690006804688: "2025-10-03T16:00:00.000Z",
      _widget_1690006804689: "2030-10-02T16:00:00.000Z",
      _widget_1690006804690: "",
      _widget_1690006804694: "模具设计岗",
      _widget_1690006804695: "黄岩区",
      _widget_1690006804696: "A",
      _widget_1690006804701: "B",
      _widget_1690006804708: ["劳动合同", "保密合同"],
      _widget_1690006804710: "2026-04-09T16:00:00.000Z",
      _widget_1690040348928: "1856260410",
      _widget_1690040348941: [],
      _widget_1690040348942: "需要",
      _widget_1690040348946: [
        {
          mime: "application/pdf",
          name: "劳动合同.pdf",
          size: 897633,
          url: "https://files.jiandaoyun.com/a70d9908-37c6-4738-8767-43bd106bbe43?attname=%E5%8A%B3%E5%8A%A8%E5%90%88%E5%90%8C.pdf&e=1779872399&token=IAM-0WcXoIsrkVmXepo5BSXTXDcIPX-DF4zkUslHbLwm:-6db8zA7ogkTZ1pbYp7s0IiS9NQ=",
        },
        {
          mime: "application/pdf",
          name: "保密协议.pdf",
          size: 489272,
          url: "https://files.jiandaoyun.com/5cb09c99-b0ba-4f01-b756-5d7b739ad9c2?attname=%E4%BF%9D%E5%AF%86%E5%8D%8F%E8%AE%AE.pdf&e=1779872399&token=IAM-0WcXoIsrkVmXepo5BSXTXDcIPX-DF4zkUslHbLwm:XRfafUeBKdK2CYDM4pQ7qGo9x6E=",
        },
      ],
      _widget_1690040348949: [],
      _widget_1690040348992: "浙江精诚时代科技股份有限公司",
      _widget_1690168915542: "",
      _widget_1690168915559: "乙方已签署",
      _widget_1690208103936: "",
      _widget_1690263250304: "是",
      _widget_1690272734699: null,
      _widget_1690349677098: null,
      _widget_1690432688885: "4085743773295814665",
      _widget_1690479795030: {
        _id: "6189db48c482520007e2e435",
        name: "梁之",
        status: 1,
        type: 0,
        username: "LiangZhi",
      },
      _widget_1691214334329: "",
      _widget_1773048529020: "签署",
      appId: "5cfef4b5de0b2278b05c8380",
      createTime: "2026-04-10T07:48:50.092Z",
      creator: {
        _id: "5c9dabe62503b18a678e0e36",
        name: "精诚时代集团",
        status: 1,
        type: 0,
        username: "#admin",
      },
      deleteTime: null,
      deleter: null,
      entryId: "64b915fe3b3b7c0008316594",
      flowState: null,
      formName: "电子合同签订",
      updateTime: "2026-05-12T08:45:09.018Z",
      updater: {
        _id: "6189db48c482520007e2e435",
        name: "梁之",
        status: 1,
        type: 0,
        username: "LiangZhi",
      },
    },
  };

  logger.info("HR contract test: replay data_update", {
    op: payload.op,
    opTime: payload.opTime,
    jdyId: payload.data._id,
    signAction: payload.data._widget_1773048529020,
    bizNo: payload.data._widget_1690040348928,
    contractId: payload.data._widget_1690432688885,
  });

  await hrContractService.handleUpdate(payload.data);

  logger.info("HR contract test: done");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("HR contract test: failed", { err });
      process.exit(1);
    });
}

