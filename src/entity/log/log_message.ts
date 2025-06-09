import {
  Entity,
  Column,
  BaseEntity,
  PrimaryColumn,
  CreateDateColumn,
} from "typeorm";
import { logger } from "../../config/logger";
import AbstractContent from "../AbstractContent";
@Entity({ name: "log_message" })
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
  @Column()
  disabled: boolean;
  @Column({ name: "content", nullable: true })
  content: string;
  @Column({ name: "userid", nullable: true, type: "simple-array" })
  userid: string[];
}
