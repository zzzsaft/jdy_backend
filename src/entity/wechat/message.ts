import { Entity, Column, BaseEntity, PrimaryColumn } from "typeorm";
import { logger } from "../../config/logger";
import AbstractContent from "../AbstractContent";
@Entity()
export class WechatMessage extends AbstractContent {
  @Column({ name: "msg_id" })
  msgId: string;
  @Column({ name: "response_code", nullable: true })
  responseCode: string;
  @Column({ name: "task_id", nullable: true })
  taskId: string;
  @Column({ name: "event_id", nullable: true })
  eventId: string;
  @Column({ name: "event_type", nullable: true })
  eventType: string;
  static async addMsgId(
    msgId: string,
    responseCode: string,
    eventId: string,
    eventType: "jdy" | "xft" | "bestSign" | "general",
    taskId?: string
  ) {
    const msg = WechatMessage.create({
      msgId,
      responseCode,
      eventId,
      eventType,
      taskId,
    });
    await msg.save();
  }
  static async getMsgId(eventId, eventType) {
    const msg = await WechatMessage.createQueryBuilder("msg")
      .where("msg.event_id = :eventId", {
        eventId,
      })
      .andWhere("msg.event_type = :eventType", {
        eventType,
      })
      .orderBy("msg.created_at", "DESC")
      .getOne();
    if (msg) {
      return { msgId: msg.msgId, responseCode: msg.responseCode };
    }
    return null;
  }
  static async updateResponseCode(taskId: string, responseCode: string) {
    const msg = await WechatMessage.findOne({ where: { taskId: taskId } });
    if (msg) {
      msg.responseCode = responseCode;
      await msg.save();
    }
  }
  static async test() {
    // await WechatMessage.addMsgId("q", "q", "q", "jdy", "q");
    // await WechatMessage.addMsgId("a", "a", "a", "jdy");
    let a = await WechatMessage.getMsgId("q", "jdy");
    console.log(a);
    await WechatMessage.getMsgId("ad", "jdy");
    await WechatMessage.updateResponseCode("a", "jdy");
  }
}
