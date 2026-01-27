import { format } from "date-fns";
import { BusinessTrip } from "../../entity/atd/businessTrip";
import { FbtApply } from "../../features/fbt/entity/fbt_trip_apply";
import { adjustToTimeNode } from "../../utils/dateUtils";
export class ApplyServies {}
// await new MessageService(["LiangZhi"]).sendTextNotice({
//   main_title: {
//     title: "工资条已生成",
//     desc: format(new Date(), "yyyy-MM-dd"),
//   },
//   sub_title_text: `亲爱的同事：
//       感谢您一直以来的辛勤付出！为确保薪资信息准确无误，请在3天内查看并确认您的薪资确认单。3天后，系统将自动默认确认。
//       点击链接进入系统查看薪资确认单。如遇页面持续加载，请点击右下角“系统登录”按钮，选择“薪福通”-“薪资确认单”进行操作。`,
//   card_action: {
//     type: 1,
//     url: "https://xft.cmbchina.com/m-prl2/#/salary-list",
//   },
// });
