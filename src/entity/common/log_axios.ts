import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
} from "typeorm";

@Entity({ name: "log_axios" })
export class LogAxios extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  host: string;

  @Column()
  url: string;

  @Column()
  method: string;

  @Column()
  payload: string;

  @Column({ nullable: true })
  res_status: number;

  @Column({ nullable: true })
  res_data: string;

  @Column({ nullable: true })
  err: string;

  @CreateDateColumn()
  created_at: Date;
}
