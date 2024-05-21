import "./config/env";
import "./config/logger";
import express, { Request, Response } from "express";
import { AppDataSource, PgDataSource } from "./config/data-source";
import { AppRoutes } from "./routes";
import cors from "cors";
import { logger } from "./config/logger";
import { schedule } from "./schedule";
import { autoParse } from "./config/autoParse";

PgDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized!");
    const app = express();
    const port = parseInt(process.env.PORT ?? "2000");
    app.use(cors());
    app.use(autoParse);
    // register all application routes
    AppRoutes.forEach((route) => {
      app[route.method](
        route.path,
        (request: Request, response: Response, next: Function) => {
          route
            .action(request, response)
            .then(() => next)
            .catch((err) => next(err));
        }
      );
    });

    // run app
    app.listen(port, () => {
      logger.info(`[server]: Server is running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.log(err);
    logger.error("Error during Data Source initialization:", err);
  });

// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("Unhandled Rejection:", reason);
// });
// schedule.forEach((task) => {
//   task.start();
// });

// function truncateKeyTo128Bits(key) {
//   // 将密钥转换为 Buffer
//   const keyBuffer = Buffer.from(key, "hex");

//   // 如果密钥长度大于128比特，则截断前128比特；如果长度小于128比特，则在末尾填充0
//   const truncatedKeyBuffer =
//     keyBuffer.length >= 16
//       ? keyBuffer.slice(0, 16)
//       : Buffer.concat([keyBuffer, Buffer.alloc(16 - keyBuffer.length)]);

//   // 将截断或填充后的 Buffer 转换为十六进制字符串
//   return truncatedKeyBuffer.toString("hex");
// }

// // 调用函数来获取长度为128比特的密钥
// const truncatedKey = truncateKeyTo128Bits(
//   "042d909b7dddff8ba831223ec7107b6046937e56dfa5df93a3bac45eaa7ae00ba767be2fc0d282ad8124d9c1719d3cf32a2dbb5679ab485d77654e72a4e7c8ac5d"
// );

// // 然后将 truncatedKey 传递给你的包
// // 然后将 truncatedKey 传递给你的包
// import sm from "sm-crypto";
// console.log(
//   Buffer.from(
//     sm.sm4.decrypt(
//       "7939ce8a64c2e79f7eaf42a90c0b495e23321fdd3d8d94f8e9c915feea0365ae57de9f19155972585876be20f629dfabf02a2984bb19e25401e7276d29c21744e68ff735ebacf5fe77f1642be6b5eb03bfdb324ae5fe1c86f5a3d054f740f509ecc9b1fb21dfc45fc8cb3aeb0df34cc2354baec7a1a3b841beed124dfbbefae3015025f976be7bed3e43120fe1f653b9f334a51d6ef1519fdefc4f203ac169c9d097a53159f0524507bfa4866ad0268116a5587cd9cc1a490301f6c502903f028efc955a2eca445cdd9c94dcd0e53ae8ae5eb5413cd080315bfbdb1bf45abceaadbdf576d0b03552872010c00f59cc9cbfef364a6edb0c713e4f06c5d103fad9abe528eb0203210d8566e0dd85d39a7650be12c390b328bcc3a9d1457d45a0e44eba854d7abe653fb9fa676ebf9d7d2cd209a5fd672a91a7505652898b894d683107cb8a88afc3f914840f5c890ef4f4e957e6d58e9f8c4ef2c4065c4def9ef19789b28a7e9d51c45c8e4e87cf2fda7707d3a6c925a94fb789f357342724c17a0cae7341c7109de0b664964987bc9109edc1ca382bbeefca97b18a3080e6d4620ebfeda8a45fb89a691e231a8874c38316c9256e0b91b53a3ff01075d131ed7d8eecf7ad9f06c2d0f609d41a03545f850b0e4b7fa42c51626f268d84b032ada61b18e78355bd97308757e6b19ddebce820f0a89dfc8000b8b00ae059c010cb10fe79c445ac12e45aab4255e9b03c66e07c57b6cc3b5b266bdccc3b1bc74f5d3d59269d0a55daf31f91b459568be3509c51b0ee031ffd5a24d9c4db4c77e205d39c44a8efd711989a2d75f665607296f2c7af58e85f433bf94fccb22735e9ad4f03de967ef3c4970494874f6d18aac4e72e3675efa916a83c7bacc9ec851e1d5d51b90765708f2be76358556bcaea9508721eacb59b397611e53cec96c96090e382a0dcd0137a6fb2e9527f5c7bdc9f325a6e5edfb7b94e471842a394733b983dd472b8f0ee5abccf644a6391afd1d927b3317e99223e6d8543612a91c68ba703bb515bface8ecb168267e395697632a7b7442a0bb09323e04e9438356611f474",
//       truncatedKey,
//       {
//         padding: "none",
//         output: "array",
//       }
//     )
//   ).toString("utf-8")
// );
// const a = {
//   appCode: "xft-bpm",
//   appName: "OA审批",
//   businessCode: "OA000001",
//   businessName: "待审批通知",
//   businessParam: "SALD_AAA00512_0000001041",
//   createTime: "2024-05-21 13:16:11",
//   dealStatus: "1",
//   details:
//     "【梁之】发起了【定调薪审批】申请，总笔数：1，定薪笔数：1，请您尽快审批，发起时间：2024-05-21 13:16:11。",
//   id: "TD1792786446024761346",
//   processId: "769004158",
//   processStatus: "0",
//   receiver: {
//     enterpriseNum: "AAA00512",
//     thirdpartyUserId: "",
//     userName: "梁之",
//     xftUserId: "U0000",
//   },
//   sendTime: "2024-05-21T13:16:11",
//   sendUser: {
//     enterpriseNum: "AAA00512",
//     thirdpartyUserId: "",
//     userName: "梁之",
//     xftUserId: "U0000",
//   },
//   terminal: "0",
//   title: "梁之发起的定调薪审批",
//   url: {},
// };
// const { id, details, businessName, receiver } = a;
// console.log(id, details, businessName, receiver);
