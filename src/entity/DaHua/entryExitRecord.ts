import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { logger } from "../../config/logger";

@Entity()
export class entry_exist_records extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  record_id: string;
  @Column({ nullable: true })
  user_id: string;
  @Column({ nullable: true })
  name: string;
  @Column()
  location: string;
  @Column()
  enter_or_exit: string;
  @Column()
  method: string;
  @Column({ nullable: true })
  car_num: string;
  @Column({ type: "timestamp with local time zone" })
  time: Date;
  @Column("interval", { nullable: true })
  gap: number;
}
