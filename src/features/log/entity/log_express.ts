import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
} from "typeorm";

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
}
