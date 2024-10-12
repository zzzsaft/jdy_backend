import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  Not,
  IsNull,
} from "typeorm";
import { decryptXftEvent } from "../../utils/xft/decrypt";
import { decryptMsg } from "../../utils/wechat/decrypt";

@Entity({ name: "log_express" })
export class LogExpress extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ip: string;

  @Column()
  method: string;

  @Column()
  query: string;

  @Column()
  path: string;

  @Column()
  msg: string;

  @Column()
  content: string;

  @CreateDateColumn()
  created_at: Date;
  // 根据需要添加其他列
  static async addToLog(ip, method, query, path, msg) {
    let content = "";
    if (path === "/xft/event") {
      const { eventId, eventRcdInf } = JSON.parse(msg);
      content = decryptXftEvent(eventRcdInf);
    } else if (path === "/wechat") {
      content = decryptMsg(JSON.parse(msg));
      if (content["xml"]?.["Event"]?.["value"] === "view") {
        return;
      }
    }

    const log = LogExpress.create({
      ip,
      method,
      query,
      path,
      msg,
      content,
    });
    await LogExpress.save(log);
  }
  static async updateXftEventLog() {
    const logs = await LogExpress.find({
      where: { path: "/xft/event", content: IsNull() },
    });
    for (const log of logs) {
      const { eventRcdInf } = JSON.parse(log.msg);
      const content = decryptXftEvent(eventRcdInf);
      log.content = content;
    }
    await LogExpress.save(logs);
  }
  static async updateWechatEventLog() {
    const logs = await LogExpress.find({
      where: { path: "/wechat", content: IsNull() },
      take: 2000,
    });
    for (const log of logs) {
      log.content = decryptMsg(JSON.parse(log.msg));
    }
    await LogExpress.save(logs);
  }
}
