import { randomBytes } from "crypto";
import { QuoteItem } from "../../entity/crm/quote";
import { QuoteItemShare } from "../../entity/crm/quoteItemShare";
import { User } from "../../entity/basic/employee";

class QuoteItemShareService {
  private async generateUuid(): Promise<string> {
    let uuid: string;
    do {
      uuid = randomBytes(5)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 6);
    } while (await QuoteItemShare.findOne({ where: { uuid } }));
    return uuid;
  }

  private generatePwd(): string {
    return Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
  }

  async createShareLink(
    quoteItemId: number,
    userId: string,
    expiresAt: Date,
    editable = false
  ) {
    let share = await QuoteItemShare.findOne({
      where: { quoteItemId, userId, editable, disabled: false },
    });
    if (!share) {
      share = QuoteItemShare.create({
        quoteItemId,
        userId,
        editable,
        disabled: false,
      });
    }
    const now = new Date();
    let expireDate = expiresAt ? new Date(expiresAt) : new Date(now.getTime() + 5 * 86400000);
    const diff = (expireDate.getTime() - now.getTime()) / 86400000;
    if (diff > 5) expireDate = new Date(now.getTime() + 5 * 86400000);
    if (diff < 0) expireDate = new Date(now.getTime() + 86400000);
    share.uuid = await this.generateUuid();
    share.pwd = await this.generatePwd();
    share.expiresAt = expireDate;
    await share.save();
    return { uuid: share.uuid, pwd: share.pwd };
  }

  async getShare(uuid: string, pwd: string) {
    const share = await QuoteItemShare.findOne({
      where: { uuid, pwd, disabled: false },
    });
    if (!share) return null;
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      return { expiredAt: share.expiresAt, shareUserId: share.userId };
    }
    const quoteItem = await QuoteItem.findOne({ where: { id: share.quoteItemId } });
    if (!quoteItem) return null;
    return {
      quoteItem,
      quoteId: quoteItem.quoteId,
      editable: share.editable,
      shareUserId: share.userId,
    };
  }

  async getShareLinks(quoteItemId: number, userId: string) {
    const shares = await QuoteItemShare.find({
      where: { quoteItemId, userId, disabled: false },
    });
    const view = shares.find((s) => !s.editable);
    const edit = shares.find((s) => s.editable);
    return {
      viewUuid: view?.uuid,
      viewPwd: view?.pwd,
      editUuid: edit?.uuid,
      editPwd: edit?.pwd,
      expireDays: view?.expiresAt
        ? Math.ceil((view.expiresAt.getTime() - Date.now()) / 86400000)
        : undefined,
    };
  }

  async disableShare(quoteItemId: number, userId: string) {
    await QuoteItemShare.update(
      { quoteItemId, userId },
      { disabled: true }
    );
  }

  async updateExpire(
    uuid: string,
    userId: string,
    expiresAt: Date
  ) {
    const share = await QuoteItemShare.findOne({
      where: { uuid, userId, disabled: false },
    });
    if (!share) return null;
    const now = new Date();
    let expireDate = expiresAt ? new Date(expiresAt) : new Date(now.getTime() + 5 * 86400000);
    const diff = (expireDate.getTime() - now.getTime()) / 86400000;
    if (diff > 5) expireDate = new Date(now.getTime() + 5 * 86400000);
    if (diff < 0) expireDate = new Date(now.getTime() + 86400000);
    share.expiresAt = expireDate;
    await share.save();
    return share;
  }

  async saveShare(
    uuid: string,
    shareUserId: string,
    quoteItem: Partial<QuoteItem>
  ) {
    const share = await QuoteItemShare.findOne({
      where: { uuid, disabled: false },
    });
    if (!share) return null;
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;
    const user = await User.findOne({ where: { user_id: shareUserId } });
    if (!user) return null;
    await QuoteItem.update({ id: share.quoteItemId }, quoteItem);
    return await QuoteItem.findOne({ where: { id: share.quoteItemId } });
  }
}

export const quoteItemShareService = new QuoteItemShareService();
