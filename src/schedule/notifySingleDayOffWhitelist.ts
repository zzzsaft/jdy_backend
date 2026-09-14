import { XftAtdLeave } from "../entity/atd/xft_leave.js";
import { logger } from "../config/logger.js";
import { MessageService } from "../features/wechat/service/messageService.js";

const WHITELIST_NOTICE_DATE = "2026-08-10";
const WHITELIST_NOTICE_TEXT =
  "2026-08-10轮休假限制已解除，如当天申请被拒，可重新提交；仍需有轮休假余额。";

export const sendSingleDayOffWhitelistReapplyNotice = async () => {
  const userids = await XftAtdLeave.findRejectedSingleDayOffUsersByDate(
    WHITELIST_NOTICE_DATE
  );
  const uniqueUserids = [...new Set(userids)];

  if (uniqueUserids.length === 0) {
    logger.info("single day off whitelist notice skipped: no rejected users");
    return;
  }

  await new MessageService(uniqueUserids).send_plain_text(WHITELIST_NOTICE_TEXT);
  logger.info(
    `single day off whitelist notice sent: ${uniqueUserids.length} users`
  );
};
