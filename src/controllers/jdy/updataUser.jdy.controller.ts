import { User } from "../../entity/wechat/User";
import { xftUserApiClient } from "../../utils/xft/xft_user";

const 转正 = async () => {
  const xft_id = await User.getXftId("");
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "1",
      },
    },
  ]);
};

const 待离职 = async () => {
  const xft_id = await User.getXftId("");
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "3",
      },
    },
  ]);
};

const 离职 = async () => {
  const xft_id = await User.getXftId("");
  await xftUserApiClient.updateEmployee([
    {
      staffBasicInfo: {
        stfSeq: xft_id,
        stfStatus: "2",
      },
    },
  ]);
};

const 调岗 = async () => {};
