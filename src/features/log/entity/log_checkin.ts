import { Entity, Column, PrimaryGeneratedColumn, BaseEntity } from "typeorm";

@Entity({ name: "log_checkin" })
export class LogCheckin extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  StartDate: Date;

  @Column()
  EndDate: Date;

  @Column()
  errmsg: string;
}
