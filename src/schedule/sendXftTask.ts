import { User } from "../entity/basic/employee";
import { Not, IsNull } from "typeorm";
import { createWechatUrl } from "../utils/stringUtils";
import { MessageService } from "../features/wechat/service/messageService";
import { xftGeneralApiClient } from "../features/xft/api/xft_general";

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
  // let userIds = { LiangZhi: "U0000" };
  for (const userId in userIds) {
    const todo = await xftGeneralApiClient.getTodoList(userIds[userId]);
    if (todo["returnCode"] == "SUC0000") {
      const records = todo["body"]["records"];
      await sendToQywx(records, userId);
    }
  }
};

const sendToQywx = async (record: object[], userid) => {
  let records = record.filter(
    (record) => record["businessCode"] != "SALDATCOL"
  );
  if (records.length == 0) {
    return;
  }
  let url = `http://hz.jc-times.com:2000/xft/sso?pageId=xftoahome`;
  url = createWechatUrl(url);
  await new MessageService([userid]).sendTextNotice({
    main_title: {
      title: "薪福通待办提醒",
      desc: "",
    },
    sub_title_text: `您还有${records.length}项未处理的薪福通待办，请点击此处进入审批。
    \n点击右下角审批中心进行审批处理。未审批项目将在下月自动通过，请及时处理`,
    card_action: {
      type: 1,
      url,
    },
    // horizontal_content_list: records.map((record, index) => {
    //   return {
    //     keyname: `待办${index + 1}`,
    //     value: record["content"].split("，")[0],
    //   };
    // }),
  });
};
