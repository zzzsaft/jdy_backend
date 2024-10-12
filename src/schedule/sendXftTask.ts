import { User } from "../entity/basic/employee";
import { Not, IsNull } from "typeorm";
import { xftGeneralApiClient } from "../utils/xft/xft_general";
import { MessageHelper } from "../utils/wechat/message";
import { createWechatUrl } from "../utils/general";

export const sendXftTodoList = async () => {
  let userIds = (
    await User.find({
      where: { is_employed: true, xft_enterprise_id: Not(IsNull()) },
      select: ["xft_enterprise_id", "user_id"],
    })
  ).reduce((acc, user) => {
    acc[user.user_id] = user.xft_enterprise_id;
    return acc;
  }, {});
  userIds = { LiangZhi: "U0000" };
  for (const userId in userIds) {
    const todo = await xftGeneralApiClient.getTodoList(userIds[userId]);
    if (todo["returnCode"] == "SUC0000") {
      const records = todo["body"]["records"];
      await sendToQywx(records, userId);
    }
  }
};

const sendToQywx = async (records: object[], userid) => {
  if (records.length == 0) {
    return;
  }
  let url = `http://hz.jc-times.com:2000/xft/sso?pageid=xftoahome`;
  url = createWechatUrl(url);
  await new MessageHelper([userid]).sendTextNotice({
    main_title: {
      title: "薪福通待办提醒",
      desc: "",
    },
    sub_title_text: `您还有${records.length}项未处理的薪福通待办，请及时处理`,
    card_action: {
      type: 1,
      url,
    },
  });
};
