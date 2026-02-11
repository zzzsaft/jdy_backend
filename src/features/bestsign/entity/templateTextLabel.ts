import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  BaseEntity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "bestsign_template_params" })
@Index(["templateId"])
@Index(["jdyId"])
export class BestSignTemplateTextLabel extends BaseEntity {
  @PrimaryColumn({ name: "jdy_id", type: "varchar", length: 64 })
  jdyId: string;

  @Column({ name: "template_id", type: "varchar", length: 64 })
  templateId: string;

  @Column({
    name: "template_name",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  templateName: string;

  @Column({ name: "text_labels", type: "jsonb", nullable: true })
  textLabels: { name: string; value: string }[];

  @Column({ name: "roles", type: "jsonb", nullable: true })
  roles: { roleid: string; is_ent: boolean }[];

  @Column({ name: "documents", type: "jsonb", nullable: true })
  documents: { name: string; documentId: string }[];

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;
}
