import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { logger } from "../../config/logger";

@Entity({ name: "entry_exit_image" })
export class entryExistImage extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ name: "record_id" })
  recordId: string;
  @Column()
  url: string;
  @Column("bytea")
  image: Buffer;
  @Column({ nullable: true, name: "mime_type" })
  mimetype: string;
}
