import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "log_location" })
export class LogLocation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userid: string;

  @Column()
  time: Date;

  @Column({ nullable: true, type: "decimal", precision: 10, scale: 6 })
  longitude: number;

  @Column({ nullable: true, type: "decimal", precision: 10, scale: 6 })
  latitude: number;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  province: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  citycode: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  adcode: string;

  @Column({ nullable: true })
  township: string;

  @Column({ nullable: true })
  towncode: string;

  @Column({ nullable: true, type: "jsonb" })
  neighborhood: any;

  @Column({ nullable: true, type: "jsonb" })
  building: any;

  @Column({ nullable: true, type: "jsonb" })
  streetNumber: any;

  @Column({ nullable: true, type: "jsonb" })
  businessAreas: any;

  @Column({ nullable: true })
  seaArea: string;

  @Column({ nullable: true, type: "jsonb" })
  detail: any;

  @CreateDateColumn()
  created_at: Date;
}
