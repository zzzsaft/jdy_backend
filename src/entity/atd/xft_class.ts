import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
@Entity("atd_xft_class")
export class XftAtdClass extends BaseEntity {
  @PrimaryColumn()
  classSeq: string;
  @Column({ nullable: true })
  className: string;
  @Column({ nullable: true })
  classShorterName: string;
  @Column({ nullable: true })
  classType: string;
  @Column({ nullable: true })
  clockRuler: string;
  @Column({ nullable: true })
  workTime: string;
  @Column({ nullable: true })
  crossingTomorrowSetting: string;
  @Column({ nullable: true })
  workDuration: string;
  @Column({ nullable: true })
  winterSummerSet: string;
  @Column({ type: "jsonb", nullable: true })
  classTimeDtos: any;
  @Column({ type: "jsonb", nullable: true })
  classNatureDtos: any;
  @Column({ type: "jsonb", nullable: true })
  classAmPmDefineDto: any;
  @Column({ type: "jsonb", nullable: true })
  flexibleSetting: any;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}
