import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "crm_template" })
export class CrmTemplate extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column("simple-array", { default: [] })
  materials: string[];

  @Column("simple-array", { default: [] })
  industries: string[];

  @Column({ name: "template_type", nullable: true })
  templateType: string;

  @Column({ name: "creator_id", nullable: true })
  creatorId: string;

  @Column("jsonb", { nullable: true })
  config: any;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
