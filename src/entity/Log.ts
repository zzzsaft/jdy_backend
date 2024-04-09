import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
} from "typeorm";

@Entity({ name: "log" })
export class Log extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  level: string;

  @Column()
  message: string;

  @CreateDateColumn()
  created_at: Date;
  // 根据需要添加其他列
}
